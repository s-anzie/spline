import { ActorType, AgentQuestionStatus, AgentSessionStatus, WorkspaceRole } from "@repo/db";
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { PrismaService } from "../../../prisma/prisma.service";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Inject } from "@nestjs/common";
import { NotificationSent } from "../../notification/domain/notification-events";
import {
  AuthenticatedRequester,
  CurrentRequester,
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface";
import {
  AnswerQuestionDto,
  AnswerHumanQuestionDto,
  ActivateAgentDto,
  AskHumanDto,
  AskManagerDto,
  DelegateTaskDto,
  ManagerMessageDto,
  EditManagerMessageDto,
} from "./dto/agent-question.dto";
import { StartAgentSessionUseCase } from "../application/start-agent-session.use-case";
import { BadRequestException } from "@nestjs/common";
import { AgentAlreadyHasActiveSessionError } from "../application/runtime-application.errors";

@Controller("workspaces/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollaborationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly startAgentSession: StartAgentSessionUseCase,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  private async role(workspaceId: string, requester: AuthenticatedRequester) {
    return this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_actorType_actorId: {
          workspaceId,
          actorType: requester.type,
          actorId: requester.id,
        },
      },
    });
  }

  @Post("collaboration/manager-messages")
  @RequirePermission("read_tasks")
  async messageManager(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: ManagerMessageDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    if (requester.type !== ActorType.HUMAN)
      throw new ForbiddenException("Only a human operator may message the manager");
    const humanMembership = await this.role(workspaceId, requester);
    if (!humanMembership)
      throw new ForbiddenException("Human is not a member of this workspace");
    const session = await this.prisma.agentSession.findFirst({
      where: { id: dto.sessionId, workspaceId },
      include: {
        agent: { select: { promptProfile: true } },
      },
    });
    const profile = session?.agent.promptProfile as Record<string, unknown> | undefined;
    if (!session || profile?.["role"] !== "manager")
      throw new NotFoundException("Manager session not found");
    if (dto.replyToNotificationId) {
      const replyTarget = await this.prisma.notification.findFirst({
        where: { id: dto.replyToNotificationId, workspaceId },
        include: { recipients: true },
      });
      const targetCreatedBy = replyTarget?.createdBy as
        | Record<string, unknown>
        | undefined;
      const belongsToConversation =
        targetCreatedBy?.["id"] === session.agentId ||
        replyTarget?.recipients.some(
          (recipient) =>
            recipient.recipientType === ActorType.AGENT &&
            recipient.recipientId === session.agentId,
        );
      if (!replyTarget || !belongsToConversation)
        throw new NotFoundException("Reply target is not part of this manager conversation");
    }

    const notification = await this.prisma.notification.create({
      data: {
        workspaceId,
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        title: "Nouveau message de l’opérateur",
        body: dto.message.trim(),
        payload: {
          collaborationType: "HUMAN_MANAGER_MESSAGE",
          sessionId: session.id,
          managerAgentId: session.agentId,
          replyToNotificationId: dto.replyToNotificationId ?? null,
        },
        createdBy: { type: requester.type, id: requester.id },
        recipients: {
          create: {
            recipientType: ActorType.AGENT,
            recipientId: session.agentId,
          },
        },
      },
      include: { recipients: true },
    });
    this.events.publish(
      new NotificationSent(
        workspaceId,
        notification.id,
        notification.kind,
        notification.scope,
      ),
    );
    return notification;
  }

  @Patch("collaboration/manager-messages/:notificationId")
  @RequirePermission("read_tasks")
  async editManagerMessage(
    @Param("workspaceId") workspaceId: string,
    @Param("notificationId") notificationId: string,
    @Body() dto: EditManagerMessageDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    if (requester.type !== ActorType.HUMAN)
      throw new ForbiddenException("Only a human operator may edit this message");
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, workspaceId, kind: "CHAT_MESSAGE" },
      include: { recipients: true },
    });
    const createdBy = notification?.createdBy as Record<string, unknown> | undefined;
    const payload = notification?.payload as Record<string, unknown> | undefined;
    if (
      !notification ||
      createdBy?.["type"] !== ActorType.HUMAN ||
      createdBy["id"] !== requester.id ||
      payload?.["collaborationType"] !== "HUMAN_MANAGER_MESSAGE"
    )
      throw new NotFoundException("Editable manager message not found");
    if (
      notification.recipients.some((recipient) => recipient.readAt !== null)
    )
      throw new BadRequestException(
        "This message was already seen; send a correction as a reply instead",
      );
    return this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        body: dto.message.trim(),
        payload: {
          ...payload,
          editedAt: new Date().toISOString(),
        },
      },
      include: { recipients: true },
    });
  }

  @Post("collaboration/human-questions/:notificationId/answer")
  @RequirePermission("read_tasks")
  async answerHumanQuestion(
    @Param("workspaceId") workspaceId: string,
    @Param("notificationId") notificationId: string,
    @Body() dto: AnswerHumanQuestionDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    if (requester.type !== ActorType.HUMAN)
      throw new ForbiddenException("Only a human operator may answer this question");
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        workspaceId,
        recipients: {
          some: {
            recipientType: ActorType.HUMAN,
            recipientId: requester.id,
          },
        },
      },
      include: { recipients: true },
    });
    const payload = notification?.payload as Record<string, unknown> | undefined;
    if (
      !notification ||
      payload?.["collaborationType"] !== "MANAGER_HUMAN_QUESTION"
    )
      throw new NotFoundException("Human question not found");
    if (typeof payload["humanAnswer"] === "string")
      throw new BadRequestException("This human question has already been answered");

    const sessionId = payload["sessionId"];
    const managerAgentId = payload["managerAgentId"];
    if (typeof sessionId !== "string" || typeof managerAgentId !== "string")
      throw new BadRequestException("Human question has invalid manager context");
    const session = await this.prisma.agentSession.findFirst({
      where: { id: sessionId, workspaceId, agentId: managerAgentId },
    });
    if (!session) throw new NotFoundException("Manager session not found");

    const answer = dto.answer.trim();
    const answeredAt = new Date();
    await this.prisma.$transaction([
      this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          payload: {
            ...payload,
            humanAnswer: answer,
            answeredByHumanId: requester.id,
            answeredAt: answeredAt.toISOString(),
          },
        },
      }),
      this.prisma.notificationRecipient.updateMany({
        where: {
          notificationId: notification.id,
          recipientType: ActorType.HUMAN,
        },
        data: {
          deliveryStatus: "ACTED_ON",
          deliveredAt: answeredAt,
          readAt: answeredAt,
          acknowledgedAt: answeredAt,
          actionTakenAt: answeredAt,
          lastSeenAt: answeredAt,
        },
      }),
    ]);

    const reply = await this.prisma.notification.create({
      data: {
        workspaceId,
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        title: "Réponse de l’opérateur",
        body: answer,
        payload: {
          collaborationType: "HUMAN_MANAGER_ANSWER",
          replyToNotificationId: notification.id,
          question: notification.body,
          sessionId: session.id,
          managerAgentId,
        },
        createdBy: { type: requester.type, id: requester.id },
        recipients: {
          create: {
            recipientType: ActorType.AGENT,
            recipientId: managerAgentId,
          },
        },
      },
      include: { recipients: true },
    });
    this.events.publish(
      new NotificationSent(workspaceId, reply.id, reply.kind, reply.scope),
    );
    return {
      sessionId: session.id,
      answeredAt,
      deliveryStatus: "QUEUED" as const,
      notificationId: reply.id,
    };
  }

  private async syncGoalProgress(goalId: string): Promise<void> {
    const [total, done, goal] = await Promise.all([
      this.prisma.task.count({ where: { goalId, status: { not: "CANCELLED" } } }),
      this.prisma.task.count({ where: { goalId, status: "DONE" } }),
      this.prisma.goal.findUnique({ where: { id: goalId } }),
    ]);
    if (!goal) return;
    const progressPercentage = total > 0 ? Math.round((done / total) * 100) : 0;
    const leavesReview = goal.status === "REVIEW" && progressPercentage < 100;
    await this.prisma.goal.update({
      where: { id: goalId },
      data: {
        progressPercentage,
        ...(leavesReview
          ? { status: "ACTIVE", validationState: "REJECTED" }
          : {}),
      },
    });
  }

  @Get("collaboration/sync")
  @RequirePermission("read_tasks")
  async sync(
    @Param("workspaceId") workspaceId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const membership = await this.role(workspaceId, requester);
    const unavailableProviders =
      requester.type === ActorType.AGENT
        ? (
            await this.prisma.providerProfile.findMany({
              where: {
                OR: [
                  { available: false },
                  { quotaUnavailableUntil: { gt: new Date() } },
                ],
              },
              select: { provider: true },
            })
          ).map((profile) => profile.provider)
        : [];
    const questionWhere =
      requester.type === ActorType.HUMAN ||
      membership?.role === WorkspaceRole.AGENT_MANAGER
        ? { workspaceId, status: { in: [AgentQuestionStatus.OPEN, AgentQuestionStatus.ANSWERED] } }
        : { workspaceId, askerAgentId: requester.id, status: { not: AgentQuestionStatus.CLOSED } };
    const [
      workspace,
      goals,
      tasks,
      agents,
      events,
      locks,
      processes,
      machines,
      questions,
      decisions,
      artifacts,
      sessions,
    ] =
      await Promise.all([
        this.prisma.workspace.findUnique({ where: { id: workspaceId } }),
        this.prisma.goal.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } }),
        this.prisma.task.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } }),
        this.prisma.agent.findMany({
          where: {
            workspaceId,
            ...(unavailableProviders.length > 0
              ? { provider: { notIn: unavailableProviders } }
              : {}),
          },
          orderBy: { displayName: "asc" },
        }),
        this.prisma.event.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }),
        this.prisma.resourceLock.findMany({ where: { workspaceId, releasedAt: null }, orderBy: { lockedAt: "desc" } }),
        this.prisma.process.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } }),
        this.prisma.localMachine.findMany({ where: { workspaceIds: { array_contains: workspaceId } }, orderBy: { hostname: "asc" } }),
        this.prisma.agentQuestion.findMany({ where: questionWhere, orderBy: { createdAt: "asc" } }),
        this.prisma.decision.findMany({
          where: { workspaceId },
          orderBy: { decidedAt: "desc" },
        }),
        this.prisma.artifact.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: "desc" },
        }),
        this.prisma.agentSession.findMany({
          where: {
            workspaceId,
            ...(unavailableProviders.length > 0
              ? { provider: { notIn: unavailableProviders } }
              : {}),
          },
          orderBy: { startedAt: "desc" },
          take: 100,
        }),
      ]);
    const wakeStatus = await Promise.all(
      agents.map(async (agent) => {
        const latestWake = await this.prisma.agentSession.findFirst({
          where: {
            agentId: agent.id,
            instruction: { startsWith: "Periodic Spline collaboration wake-up." },
          },
          orderBy: { startedAt: "desc" },
          select: { id: true, status: true, startedAt: true, endedAt: true },
        });
        return {
          agentId: agent.id,
          provider: agent.provider,
          scheduler: latestWake
            ? { status: "OBSERVED", session: latestWake }
            : { status: "AWAITING_FIRST_WAKE" },
          nativeCron:
            agent.provider === "claude"
              ? { status: "DISABLED_SPLINE_AUTHORITATIVE" }
              : { status: "NOT_SUPPORTED" },
        };
      }),
    );
    return {
      workspace,
      goals,
      tasks,
      agents,
      events,
      locks,
      processes,
      machines,
      questions,
      decisions,
      artifacts,
      sessions,
      wakeStatus,
    };
  }

  @Post("agent-questions")
  @RequirePermission("create_task")
  async ask(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: AskManagerDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const membership = await this.role(workspaceId, requester);
    if (
      requester.type !== ActorType.AGENT ||
      membership?.role !== WorkspaceRole.AGENT_CONTRIBUTOR
    )
      throw new ForbiddenException("Only contributor agents may ask the manager");
    const manager = await this.prisma.workspaceMembership.findFirst({
      where: { workspaceId, actorType: ActorType.AGENT, role: WorkspaceRole.AGENT_MANAGER },
      orderBy: { createdAt: "asc" },
    });
    if (!manager) throw new NotFoundException("No manager agent is configured");
    const question = await this.prisma.agentQuestion.create({
      data: {
        workspaceId,
        askerAgentId: requester.id,
        managerAgentId: manager.actorId,
        sessionId: dto.sessionId,
        question: dto.question.trim(),
        context: dto.context.trim(),
        options: dto.options ?? [],
        recommendation: dto.recommendation?.trim(),
        blocking: dto.blocking,
      },
    });
    const notification = await this.prisma.notification.create({
      data: {
        workspaceId,
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        title: dto.blocking ? "Question bloquante d’un collaborateur" : "Question d’un collaborateur",
        body: dto.question.trim(),
        payload: {
          collaborationType: "CONTRIBUTOR_MANAGER_QUESTION",
          questionId: question.id,
          context: dto.context.trim(),
          options: dto.options ?? [],
          recommendation: dto.recommendation?.trim() ?? null,
          blocking: dto.blocking,
          sessionId: dto.sessionId ?? null,
        },
        createdBy: { type: requester.type, id: requester.id },
        recipients: {
          create: {
            recipientType: ActorType.AGENT,
            recipientId: manager.actorId,
          },
        },
      },
      include: { recipients: true },
    });
    this.events.publish(
      new NotificationSent(workspaceId, notification.id, notification.kind, notification.scope),
    );
    return question;
  }

  @Post("collaboration/ask-human")
  @RequirePermission("create_task")
  async askHuman(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: AskHumanDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const membership = await this.role(workspaceId, requester);
    if (
      requester.type !== ActorType.AGENT ||
      membership?.role !== WorkspaceRole.AGENT_MANAGER
    )
      throw new ForbiddenException("Only the manager agent may ask the human");

    const session = await this.prisma.agentSession.findFirst({
      where: { id: dto.sessionId, workspaceId, agentId: requester.id },
      select: { id: true },
    });
    if (!session)
      throw new NotFoundException("Manager session not found in workspace");

    const humans = await this.prisma.workspaceMembership.findMany({
      where: {
        workspaceId,
        actorType: ActorType.HUMAN,
        role: { in: [WorkspaceRole.OWNER, WorkspaceRole.HUMAN_OPERATOR] },
      },
      select: { actorId: true },
    });
    if (!humans.length)
      throw new NotFoundException("No human operator is configured");

    const notification = await this.prisma.notification.create({
      data: {
        workspaceId,
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        title: "Le manager a besoin de votre décision",
        body: dto.question.trim(),
        payload: {
          collaborationType: "MANAGER_HUMAN_QUESTION",
          context: dto.context.trim(),
          options: dto.options ?? [],
          recommendation: dto.recommendation?.trim() ?? null,
          sessionId: dto.sessionId,
          managerAgentId: requester.id,
        },
        createdBy: { type: requester.type, id: requester.id },
        recipients: {
          create: humans.map((human) => ({
            recipientType: ActorType.HUMAN,
            recipientId: human.actorId,
          })),
        },
      },
      include: { recipients: true },
    });
    this.events.publish(
      new NotificationSent(
        workspaceId,
        notification.id,
        notification.kind,
        notification.scope,
      ),
    );
    return notification;
  }

  @Get("agent-questions")
  @RequirePermission("read_tasks")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query("status") status: AgentQuestionStatus | undefined,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const membership = await this.role(workspaceId, requester);
    const identityFilter =
      requester.type === ActorType.HUMAN || membership?.role === WorkspaceRole.AGENT_MANAGER
        ? {}
        : { askerAgentId: requester.id };
    return this.prisma.agentQuestion.findMany({
      where: { workspaceId, ...identityFilter, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  @Post("agent-questions/:questionId/answer")
  @RequirePermission("create_task")
  async answer(
    @Param("workspaceId") workspaceId: string,
    @Param("questionId") questionId: string,
    @Body() dto: AnswerQuestionDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const membership = await this.role(workspaceId, requester);
    if (
      requester.type !== ActorType.AGENT ||
      membership?.role !== WorkspaceRole.AGENT_MANAGER
    )
      throw new ForbiddenException("Only the manager agent may answer contributor questions");
    const question = await this.prisma.agentQuestion.findFirst({ where: { id: questionId, workspaceId } });
    if (!question) throw new NotFoundException("Question not found");
    if (question.status !== AgentQuestionStatus.OPEN)
      throw new BadRequestException("Only an OPEN question can be answered");
    const answeredAt = new Date();
    const answered = await this.prisma.agentQuestion.update({
      where: { id: question.id },
      data: {
        answer: dto.answer.trim(),
        answeredByAgentId: requester.id,
        answeredAt,
        status: AgentQuestionStatus.ANSWERED,
      },
    });
    await this.prisma.notificationRecipient.updateMany({
      where: {
        recipientType: ActorType.AGENT,
        recipientId: requester.id,
        notification: {
          workspaceId,
          payload: { path: ["questionId"], equals: question.id },
        },
      },
      data: {
        deliveryStatus: "ACTED_ON",
        deliveredAt: answeredAt,
        readAt: answeredAt,
        acknowledgedAt: answeredAt,
        actionTakenAt: answeredAt,
        lastSeenAt: answeredAt,
      },
    });
    const notification = await this.prisma.notification.create({
      data: {
        workspaceId,
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        title: "Réponse du manager",
        body: dto.answer.trim(),
        payload: {
          collaborationType: "MANAGER_CONTRIBUTOR_ANSWER",
          questionId: question.id,
          sessionId: question.sessionId,
        },
        createdBy: { type: requester.type, id: requester.id },
        recipients: {
          create: {
            recipientType: ActorType.AGENT,
            recipientId: question.askerAgentId,
          },
        },
      },
      include: { recipients: true },
    });
    this.events.publish(
      new NotificationSent(workspaceId, notification.id, notification.kind, notification.scope),
    );
    return answered;
  }

  @Post("agent-questions/:questionId/acknowledge")
  @RequirePermission("read_tasks")
  async acknowledge(
    @Param("workspaceId") workspaceId: string,
    @Param("questionId") questionId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const question = await this.prisma.agentQuestion.findFirst({ where: { id: questionId, workspaceId } });
    if (!question) throw new NotFoundException("Question not found");
    if (requester.type !== ActorType.AGENT || question.askerAgentId !== requester.id)
      throw new ForbiddenException("Only the asking contributor may acknowledge this answer");
    if (question.status !== AgentQuestionStatus.ANSWERED)
      throw new BadRequestException("Only an ANSWERED question can be acknowledged");
    const acknowledgedAt = new Date();
    const acknowledged = await this.prisma.agentQuestion.update({
      where: { id: question.id },
      data: { acknowledgedAt, status: AgentQuestionStatus.ACKNOWLEDGED },
    });
    await this.prisma.notificationRecipient.updateMany({
      where: {
        recipientType: ActorType.AGENT,
        recipientId: requester.id,
        notification: {
          workspaceId,
          payload: { path: ["questionId"], equals: question.id },
        },
      },
      data: {
        deliveryStatus: "ACTED_ON",
        deliveredAt: acknowledgedAt,
        readAt: acknowledgedAt,
        acknowledgedAt,
        actionTakenAt: acknowledgedAt,
        lastSeenAt: acknowledgedAt,
      },
    });
    return acknowledged;
  }

  @Post("agent-questions/:questionId/close")
  @RequirePermission("create_task")
  async close(
    @Param("workspaceId") workspaceId: string,
    @Param("questionId") questionId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const membership = await this.role(workspaceId, requester);
    if (requester.type !== ActorType.AGENT || membership?.role !== WorkspaceRole.AGENT_MANAGER)
      throw new ForbiddenException("Only the manager agent may close questions");
    const question = await this.prisma.agentQuestion.findFirst({ where: { id: questionId, workspaceId } });
    if (!question) throw new NotFoundException("Question not found");
    if (question.status !== AgentQuestionStatus.ACKNOWLEDGED)
      throw new BadRequestException("Only an ACKNOWLEDGED question can be closed");
    return this.prisma.agentQuestion.update({
      where: { id: question.id },
      data: { closedAt: new Date(), status: AgentQuestionStatus.CLOSED },
    });
  }

  @Post("collaboration/delegate")
  @RequirePermission("start_process")
  async delegate(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: DelegateTaskDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const membership = await this.role(workspaceId, requester);
    if (
      requester.type !== ActorType.AGENT ||
      membership?.role !== WorkspaceRole.AGENT_MANAGER
    )
      throw new ForbiddenException("Only the manager agent may delegate work");
    const contributor = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_actorType_actorId: {
          workspaceId,
          actorType: ActorType.AGENT,
          actorId: dto.agentId,
        },
      },
    });
    if (contributor?.role !== WorkspaceRole.AGENT_CONTRIBUTOR)
      throw new BadRequestException("Delegation target must be a contributor agent");
    const goal = await this.prisma.goal.findFirst({
      where: { id: dto.goalId, workspaceId },
      select: { id: true },
    });
    if (!goal) throw new BadRequestException("Delegation goal must belong to this workspace");

    const task = await this.prisma.task.create({
      data: {
        workspaceId,
        goalId: goal.id,
        title: dto.title.trim(),
        description: dto.description.trim(),
        priority: dto.priority,
        status: "TODO",
        assigneeType: ActorType.AGENT,
        assigneeId: dto.agentId,
        createdByType: requester.type,
        createdById: requester.id,
      },
    });
    await this.syncGoalProgress(goal.id);
    const started = await this.startAgentSession.execute({
      workspaceId,
      agentId: dto.agentId,
      machineId: dto.machineId,
      taskId: task.id,
      instruction: dto.instruction,
      requesterType: requester.type,
    });
    if (started.isFailure) {
      if (started.error instanceof AgentAlreadyHasActiveSessionError) {
        const active = await this.prisma.agentSession.findFirst({
          where: {
            workspaceId,
            agentId: dto.agentId,
            status: { in: ["STARTING", "RUNNING", "AWAITING_APPROVAL"] },
          },
          orderBy: { updatedAt: "desc" },
        });
        return {
          task,
          sessionId: active?.id ?? null,
          launchStatus: "QUEUED",
          message:
            "Task assigned and kept in the contributor queue; the agent is already executing another turn. Do not launch a parallel session.",
        };
      }
      await this.prisma.task.delete({ where: { id: task.id } });
      await this.syncGoalProgress(goal.id);
      throw new BadRequestException(started.error.message);
    }
    return {
      task,
      sessionId: started.value.id.toString(),
      launchStatus: "STARTED",
    };
  }

  @Post("collaboration/activate-agent")
  @RequirePermission("start_process")
  async activateAgent(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: ActivateAgentDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const membership = await this.role(workspaceId, requester);
    if (
      requester.type !== ActorType.AGENT ||
      membership?.role !== WorkspaceRole.AGENT_MANAGER
    )
      throw new ForbiddenException("Only the manager agent may activate contributors");

    const contributor = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_actorType_actorId: {
          workspaceId,
          actorType: ActorType.AGENT,
          actorId: dto.agentId,
        },
      },
    });
    if (contributor?.role !== WorkspaceRole.AGENT_CONTRIBUTOR)
      throw new BadRequestException("Activation target must be a contributor agent");

    const contributorAgent = await this.prisma.agent.findUnique({
      where: { id: dto.agentId },
      select: { provider: true },
    });
    const latest = await this.prisma.agentSession.findFirst({
      where: { workspaceId, agentId: dto.agentId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    const executingStatuses = new Set<AgentSessionStatus>([
      AgentSessionStatus.STARTING,
      AgentSessionStatus.RUNNING,
      AgentSessionStatus.AWAITING_APPROVAL,
    ]);
    if (
      latest &&
      executingStatuses.has(latest.status)
    ) {
      return {
        outcome: "ALREADY_ACTIVE",
        sessionId: latest.id,
        status: latest.status,
        message: "The contributor is already executing. Monitor this session and do not start another instance.",
      };
    }

    const recoverableStatuses = new Set<AgentSessionStatus>([
      AgentSessionStatus.IDLE,
      AgentSessionStatus.FAILED,
      AgentSessionStatus.CRASHED,
    ]);
    const canResume =
      latest?.providerSessionId &&
      recoverableStatuses.has(latest.status) &&
      // A session recorded under a provider the agent has since been
      // switched away from can never be resumed (see
      // StartAgentSessionUseCase, which enforces this too) — check it here
      // as well so activation gracefully falls through to a fresh/lineage
      // start instead of hard-failing the whole call.
      latest.provider === contributorAgent?.provider;
    const started = await this.startAgentSession.execute({
      workspaceId,
      agentId: dto.agentId,
      machineId: dto.machineId,
      taskId: dto.taskId,
      instruction: dto.instruction,
      requesterType: requester.type,
      ...(canResume
        ? { resumeFromSessionId: latest.id }
        : latest
          ? { lineageFromSessionId: latest.id }
          : {}),
    });
    if (started.isFailure) throw new BadRequestException(started.error.message);
    return {
      outcome: canResume
        ? latest?.status === AgentSessionStatus.IDLE
          ? "WOKEN"
          : "RECOVERED"
        : "STARTED",
      sessionId: started.value.id.toString(),
      status: started.value.status,
      previousSessionId: latest?.id ?? null,
    };
  }
}
