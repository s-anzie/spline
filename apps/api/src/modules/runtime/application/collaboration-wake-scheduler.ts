import { ActorType, AgentSessionStatus, LocalMachineRuntimeStatus, TaskStatus, WorkspaceRole } from "@repo/db";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { PrismaService } from "../../../prisma/prisma.service";
import { StartAgentSessionUseCase } from "./start-agent-session.use-case";
import { ReportSessionStatusUseCase } from "./report-session-status.use-case";
import { SESSION_STALE_TTL_MS } from "../domain/runtime-thresholds";

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_WAKE_MINUTES = 2;
const DEFAULT_CHECKPOINT_MINUTES = 30;

function positiveMinutes(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

function wakeInstruction(role: WorkspaceRole): string {
  if (role === WorkspaceRole.AGENT_MANAGER) {
    return [
      "Periodic Spline collaboration wake-up.",
      "Call spline_sync_workspace and spline_list_notifications, then inspect goals, tasks, locks, processes, durable human answers, the persistent question inbox, and collaborator status.",
      "Answer contributor questions you can resolve, delegate or unblock actionable work, and validate completed outputs.",
      "If no objective exists and no prior human request is awaiting execution, ask the human user for the next objective in one concise message.",
      "If there is genuinely nothing to do and no question to escalate, publish an idle status and end the turn cleanly.",
    ].join(" ");
  }
  return [
    "Periodic Spline collaboration wake-up.",
    "Call spline_sync_workspace, then inspect assigned tasks, relevant goals, resource locks, answered manager questions, and process state.",
    "Continue authorized work when actionable. If blocked, call spline_ask_manager once and end the turn cleanly.",
    "Never ask the human directly. If there is no assigned work, publish an idle status and end the turn without speculative changes.",
  ].join(" ");
}

@Injectable()
export class CollaborationWakeScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollaborationWakeScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly startSession: StartAgentSessionUseCase,
    private readonly reportSessionStatus: ReportSessionStatusUseCase,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcileAbandonedExecutions();
      const workspaces = await this.prisma.workspace.findMany({
        where: { status: "ACTIVE", rootPath: { not: null } },
        include: {
          memberships: {
            where: {
              actorType: "AGENT",
              role: { in: [WorkspaceRole.AGENT_MANAGER, WorkspaceRole.AGENT_CONTRIBUTOR] },
            },
          },
        },
      });

      for (const workspace of workspaces) {
        const ruleset = workspace.ruleset as Record<string, unknown>;
        const collaboration =
          ruleset["collaboration"] && typeof ruleset["collaboration"] === "object"
            ? (ruleset["collaboration"] as Record<string, unknown>)
            : {};
        if (collaboration["autoWakeEnabled"] === false) continue;
        const fallback = positiveMinutes(
          collaboration["wakeIntervalMinutes"],
          DEFAULT_WAKE_MINUTES,
        );

        for (const membership of workspace.memberships) {
          const latest = await this.prisma.agentSession.findFirst({
            where: { workspaceId: workspace.id, agentId: membership.actorId },
            orderBy: { startedAt: "desc" },
          });
          // A first user/manager assignment is required before an agent joins
          // the autonomous loop. Never invent an initial objective.
          if (!latest) continue;
          const provider = await this.prisma.providerProfile.findUnique({
            where: { provider: latest.provider },
            select: { available: true, quotaUnavailableUntil: true },
          });
          if (
            provider?.available === false ||
            (provider?.quotaUnavailableUntil &&
              provider.quotaUnavailableUntil.getTime() > Date.now())
          )
            continue;
          const unreadMessages = await this.prisma.notificationRecipient.count({
            where: {
              recipientType: "AGENT",
              recipientId: membership.actorId,
              readAt: null,
              deliveryStatus: { not: "FAILED" },
              notification: { workspaceId: workspace.id, kind: "CHAT_MESSAGE" },
            },
          });
          // IDLE means the durable conversation may be woken. Every other
          // state is deliberate: executing states already own a provider
          // process, while FAILED/CRASHED/COMPLETED/STOPPED require an
          // explicit recovery or a fresh human/manager activation.
          if (latest.status !== AgentSessionStatus.IDLE) continue;

          const isManager = membership.role === WorkspaceRole.AGENT_MANAGER;
          const [assignedWork, openQuestions, reviewOrActiveTeamWork] =
            await Promise.all([
              this.prisma.task.count({
                where: {
                  workspaceId: workspace.id,
                  assigneeType: ActorType.AGENT,
                  assigneeId: membership.actorId,
                  status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
                },
              }),
              this.prisma.agentQuestion.count({
                where: isManager
                  ? {
                      workspaceId: workspace.id,
                      managerAgentId: membership.actorId,
                      status: "OPEN",
                    }
                  : {
                      workspaceId: workspace.id,
                      askerAgentId: membership.actorId,
                      status: "ANSWERED",
                    },
              }),
              isManager
                ? this.prisma.task.count({
                    where: {
                      workspaceId: workspace.id,
                      status: {
                        in: [TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW],
                      },
                    },
                  })
                : Promise.resolve(0),
            ]);
          const hasActionableWork =
            unreadMessages > 0 ||
            assignedWork > 0 ||
            openQuestions > 0 ||
            reviewOrActiveTeamWork > 0;
          // An agent with nothing queued still needs to check in occasionally
          // — its own wake instruction already assumes this (a contributor
          // reports idle status, the manager asks the human for the next
          // objective) — otherwise a fully caught-up team goes silent
          // forever with no signal to anyone that new work is needed. This
          // interval is deliberately much longer than the busy-wake interval
          // below, since there is nothing actionable to act on yet.
          const checkpointMinutes = positiveMinutes(
            collaboration["checkpointIntervalMinutes"],
            DEFAULT_CHECKPOINT_MINUTES,
          );
          const dueForCheckpoint =
            Date.now() - latest.updatedAt.getTime() >= checkpointMinutes * 60_000;
          if (!hasActionableWork && !dueForCheckpoint) continue;
          const roleKey =
            membership.role === WorkspaceRole.AGENT_MANAGER
              ? "managerWakeIntervalMinutes"
              : "contributorWakeIntervalMinutes";
          const wakeMinutes = positiveMinutes(collaboration[roleKey], fallback);
          if (Date.now() - latest.updatedAt.getTime() < wakeMinutes * 60_000) continue;

          const machine = await this.prisma.localMachine.findFirst({
            where: {
              id: latest.machineId,
              runtimeStatus: LocalMachineRuntimeStatus.ONLINE,
            },
          });
          if (!machine) continue;

          // Codex persists sandbox/MCP settings in its native thread. Threads
          // created before a runtime networking fix can therefore remain
          // permanently unable to reach Spline even after the daemon is
          // upgraded. Detect that concrete failure and recover with a fresh
          // provider thread while carrying the original human objective.
          const result = await this.startSession.execute({
            workspaceId: workspace.id,
            agentId: membership.actorId,
            machineId: machine.id,
            taskId: latest.currentTaskId ?? undefined,
            instruction: wakeInstruction(membership.role),
            ...(latest.providerSessionId
              ? { resumeFromSessionId: latest.id }
              : { lineageFromSessionId: latest.id }),
          });
          if (result.isFailure)
            this.logger.debug(
              `Wake skipped for agent ${membership.actorId}: ${result.error.message}`,
            );
        }
      }
    } catch (error) {
      this.logger.error("Collaboration wake-up cycle failed", error);
    } finally {
      this.running = false;
    }
  }

  private async reconcileAbandonedExecutions(): Promise<void> {
    const cutoff = new Date(Date.now() - SESSION_STALE_TTL_MS * 2);
    const abandoned = await this.prisma.agentSession.findMany({
      where: {
        status: { in: ["STARTING", "RUNNING", "AWAITING_APPROVAL"] },
        OR: [
          { lastHeartbeatAt: { lt: cutoff } },
          { lastHeartbeatAt: null, startedAt: { lt: cutoff } },
        ],
        machine: {
          OR: [
            { runtimeStatus: LocalMachineRuntimeStatus.OFFLINE },
            { lastSeenAt: { lt: cutoff } },
            { lastSeenAt: null },
          ],
        },
      },
      select: { id: true },
    });
    for (const session of abandoned) {
      const result = await this.reportSessionStatus.execute({
        sessionId: session.id,
        status: AgentSessionStatus.CRASHED,
      });
      if (result.isFailure)
        this.logger.warn(
          `Unable to reconcile abandoned session ${session.id}: ${result.error.message}`,
        );
    }
  }
}
