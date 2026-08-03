import {
  ActorType,
  AgentSessionStatus,
  EventSeverity,
  NotificationDeliveryStatus,
  NotificationKind,
  NotificationScope,
  WorkspaceRole,
} from "@repo/db";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { PrismaService } from "../../../prisma/prisma.service";
import { EventRecorded } from "../../event/domain/event-events";
import { NotificationSent } from "../../notification/domain/notification-events";
import { AgentSessionStatusChanged } from "../domain/agent-session-events";
import { StartAgentSessionUseCase } from "./start-agent-session.use-case";

const FAILURE_STATUSES = new Set<AgentSessionStatus>([
  AgentSessionStatus.FAILED,
  AgentSessionStatus.CRASHED,
]);

function stableId(value: string): string {
  return createHash("sha256").update(`spline-runtime-incident:${value}`).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * Converts a low-level runtime failure into a durable, actionable incident.
 * The deterministic journal id makes delivery idempotent even if a daemon or
 * API reconnect reports the same terminal transition more than once.
 */
@Injectable()
export class NotifyManagerOnSessionFailure {
  private readonly logger = new Logger(NotifyManagerOnSessionFailure.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly startSession: StartAgentSessionUseCase,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  @OnEvent("agent_session.status_changed", { async: true })
  async handle(event: AgentSessionStatusChanged): Promise<void> {
    if (!FAILURE_STATUSES.has(event.to)) return;

    try {
      await this.notifyAndWake(event);
    } catch (error) {
      this.logger.error(
        `Could not notify the manager about failed session ${event.sessionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyAndWake(event: AgentSessionStatusChanged): Promise<void> {
    const session = await this.prisma.agentSession.findUnique({
      where: { id: event.sessionId },
      include: { agent: { select: { displayName: true } } },
    });
    if (!session || session.workspaceId !== event.workspaceId) return;

    const [failedMembership, managerMembership, task, orphanedLocks] = await Promise.all([
      this.prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_actorType_actorId: {
            workspaceId: event.workspaceId,
            actorType: ActorType.AGENT,
            actorId: session.agentId,
          },
        },
      }),
      this.prisma.workspaceMembership.findFirst({
        where: {
          workspaceId: event.workspaceId,
          actorType: ActorType.AGENT,
          role: WorkspaceRole.AGENT_MANAGER,
        },
        orderBy: { createdAt: "asc" },
      }),
      session.currentTaskId
        ? this.prisma.task.findUnique({
            where: { id: session.currentTaskId },
            select: { title: true },
          })
        : Promise.resolve(null),
      this.prisma.resourceLock.findMany({
        where: {
          workspaceId: event.workspaceId,
          lockedByType: ActorType.AGENT,
          lockedById: session.agentId,
          releasedAt: null,
        },
        select: { id: true, resourceType: true, resourceId: true },
      }),
    ]);

    const failedManager = failedMembership?.role === WorkspaceRole.AGENT_MANAGER;
    const failedContributor =
      failedMembership?.role === WorkspaceRole.AGENT_CONTRIBUTOR;
    if (!failedManager && !failedContributor) return;
    if (failedContributor && !managerMembership) return;
    const humanOperators = failedManager
      ? await this.prisma.workspaceMembership.findMany({
          where: {
            workspaceId: event.workspaceId,
            actorType: ActorType.HUMAN,
            role: { in: [WorkspaceRole.OWNER, WorkspaceRole.HUMAN_OPERATOR] },
          },
          select: { actorId: true },
        })
      : [];
    if (failedManager && humanOperators.length === 0) return;

    // A reusable provider conversation may fail, recover, then fail again.
    // updatedAt identifies this concrete transition while still deduplicating
    // duplicate delivery of the same domain event.
    const incidentId = stableId(
      `agent-session:${event.sessionId}:${event.to}:${session.updatedAt.toISOString()}`,
    );
    const notificationId = stableId(`notification:${incidentId}`);
    const recipients = failedManager
      ? humanOperators.map((human) => ({ type: ActorType.HUMAN, id: human.actorId }))
      : [{ type: ActorType.AGENT, id: managerMembership!.actorId }];
    const taskLabel = task ? ` pour « ${task.title} »` : "";
    const body = failedManager
      ? `Le manager ${session.agent.displayName} a interrompu sa session (${event.from} → ${event.to}). La coordination humaine est requise pour inspecter ou relancer cette conversation.`
      : `${session.agent.displayName} a interrompu sa session${taskLabel} (${event.from} → ${event.to}). Examinez l’incident, réassignez ou relancez le travail.`;
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.event.create({
          data: {
            id: incidentId,
            workspaceId: event.workspaceId,
            type: "agent_session.failure_detected",
            severity:
              event.to === AgentSessionStatus.CRASHED
                ? EventSeverity.CRITICAL
                : EventSeverity.ERROR,
            actor: { type: "SYSTEM", id: "runtime-supervisor" },
            target: { type: "AGENT_SESSION", id: event.sessionId },
            payload: {
              sessionId: event.sessionId,
              agentId: session.agentId,
              agentName: session.agent.displayName,
              machineId: session.machineId,
              taskId: session.currentTaskId,
              from: event.from,
              to: event.to,
              releasedLocks: orphanedLocks,
            },
            createdAt: now,
          },
        });
        await tx.notification.create({
          data: {
            id: notificationId,
            workspaceId: event.workspaceId,
            kind: NotificationKind.SYSTEM_ALERT,
            scope: NotificationScope.DIRECT,
            taskId: session.currentTaskId,
            title: failedManager
              ? `Manager indisponible · ${session.agent.displayName}`
              : `Intervention requise · ${session.agent.displayName}`,
            body,
            payload: {
              type: "agent_session_failure",
              sessionId: event.sessionId,
              agentId: session.agentId,
              status: event.to,
            },
            linkedEventId: incidentId,
            createdBy: { type: "SYSTEM", id: "runtime-supervisor" },
            createdAt: now,
          },
        });
        for (const recipient of recipients) {
          await tx.notificationRecipient.create({
            data: {
              id: stableId(
                `recipient:${notificationId}:${recipient.type}:${recipient.id}`,
              ),
              notificationId,
              recipientType: recipient.type,
              recipientId: recipient.id,
              deliveryStatus: NotificationDeliveryStatus.PENDING,
            },
          });
        }
        if (orphanedLocks.length > 0) {
          await tx.resourceLock.updateMany({
            where: { id: { in: orphanedLocks.map((lock) => lock.id) } },
            data: { releasedAt: now },
          });
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return;
      throw error;
    }

    this.events.publish(
      new EventRecorded(
        event.workspaceId,
        incidentId,
        "agent_session.failure_detected",
        event.to === AgentSessionStatus.CRASHED ? "CRITICAL" : "ERROR",
      ),
    );
    this.events.publish(
      new NotificationSent(
        event.workspaceId,
        notificationId,
        NotificationKind.SYSTEM_ALERT,
        NotificationScope.DIRECT,
      ),
    );

    if (failedContributor) {
      await this.wakeIdleManager(
        event.workspaceId,
        managerMembership!.actorId,
        session.currentTaskId ?? undefined,
        body,
      );
    }
  }

  private async wakeIdleManager(
    workspaceId: string,
    managerId: string,
    taskId: string | undefined,
    incidentSummary: string,
  ): Promise<void> {
    const managerSession = await this.prisma.agentSession.findFirst({
      where: {
        workspaceId,
        agentId: managerId,
        status: AgentSessionStatus.IDLE,
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!managerSession) return;

    const result = await this.startSession.execute({
      workspaceId,
      agentId: managerId,
      machineId: managerSession.machineId,
      taskId,
      resumeFromSessionId: managerSession.id,
      requesterType: ActorType.AGENT,
      instruction: [
        "Priority Spline incident notification.",
        incidentSummary,
        "Call spline_sync_workspace, inspect the linked task and session evidence, then unblock, retry, or reassign the work. Record your decision and notify the human only if their intervention is required.",
      ].join(" "),
    });
    if (result.isFailure) {
      this.logger.debug(
        `Manager ${managerId} was notified but could not be woken immediately: ${result.error.message}`,
      );
    }
  }
}
import { createHash } from "node:crypto";
