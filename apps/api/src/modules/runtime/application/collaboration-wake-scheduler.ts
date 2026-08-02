import { AgentSessionStatus, LocalMachineRuntimeStatus, WorkspaceRole } from "@repo/db";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { PrismaService } from "../../../prisma/prisma.service";
import { StartAgentSessionUseCase } from "./start-agent-session.use-case";

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_WAKE_MINUTES = 2;

function positiveMinutes(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

function wakeInstruction(role: WorkspaceRole): string {
  if (role === WorkspaceRole.AGENT_MANAGER) {
    return [
      "Periodic Spline collaboration wake-up.",
      "Call spline_sync_workspace, then inspect goals, tasks, locks, processes, the persistent question inbox, and collaborator status.",
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
          if (!latest || latest.status !== AgentSessionStatus.IDLE) continue;
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
            resumeFromSessionId: latest.id,
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
}
