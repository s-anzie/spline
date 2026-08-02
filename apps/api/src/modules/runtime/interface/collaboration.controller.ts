import { ActorType, AgentQuestionStatus, WorkspaceRole } from "@repo/db";
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { PrismaService } from "../../../prisma/prisma.service";
import {
  AuthenticatedRequester,
  CurrentRequester,
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface";
import {
  AnswerQuestionDto,
  AskHumanDto,
  AskManagerDto,
  DelegateTaskDto,
} from "./dto/agent-question.dto";
import { StartAgentSessionUseCase } from "../application/start-agent-session.use-case";
import { BadRequestException } from "@nestjs/common";

@Controller("workspaces/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollaborationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly startAgentSession: StartAgentSessionUseCase,
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

  @Get("collaboration/sync")
  @RequirePermission("read_tasks")
  async sync(
    @Param("workspaceId") workspaceId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const membership = await this.role(workspaceId, requester);
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
        this.prisma.agent.findMany({ where: { workspaceId }, orderBy: { displayName: "asc" } }),
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
          where: { workspaceId },
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
        const nativeCronEvidence =
          agent.provider === "claude"
            ? await this.prisma.agentSessionOutput.findFirst({
                where: {
                  session: { agentId: agent.id },
                  content: { contains: "CronCreate" },
                },
                orderBy: { createdAt: "desc" },
                select: { createdAt: true, sessionId: true },
              })
            : null;
        return {
          agentId: agent.id,
          provider: agent.provider,
          scheduler: latestWake
            ? { status: "OBSERVED", session: latestWake }
            : { status: "AWAITING_FIRST_WAKE" },
          nativeCron:
            agent.provider === "claude"
              ? nativeCronEvidence
                ? { status: "OBSERVED", ...nativeCronEvidence }
                : { status: "NOT_OBSERVED" }
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
    return this.prisma.agentQuestion.create({
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

    return this.prisma.notification.create({
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
    return this.prisma.agentQuestion.update({
      where: { id: question.id },
      data: {
        answer: dto.answer.trim(),
        answeredByAgentId: requester.id,
        answeredAt: new Date(),
        status: AgentQuestionStatus.ANSWERED,
      },
    });
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
    return this.prisma.agentQuestion.update({
      where: { id: question.id },
      data: { acknowledgedAt: new Date(), status: AgentQuestionStatus.ACKNOWLEDGED },
    });
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

    const task = await this.prisma.task.create({
      data: {
        workspaceId,
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
    const started = await this.startAgentSession.execute({
      workspaceId,
      agentId: dto.agentId,
      machineId: dto.machineId,
      taskId: task.id,
      instruction: dto.instruction,
      requesterType: requester.type,
    });
    if (started.isFailure) {
      await this.prisma.task.delete({ where: { id: task.id } });
      throw new BadRequestException(started.error.message);
    }
    return { task, sessionId: started.value.id.toString() };
  }
}
