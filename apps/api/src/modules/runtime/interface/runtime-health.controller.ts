import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { JwtAuthGuard, PermissionsGuard, RequirePermission } from "../../identity/interface";
import { GetRuntimeHealthUseCase, RuntimeHealthSummary } from "../application/get-runtime-health.use-case";

function toRuntimeHealthResponse(summary: RuntimeHealthSummary) {
  return {
    machines: {
      total: summary.machines.total,
      online: summary.machines.online,
      stale: summary.machines.stale,
      offline: summary.machines.offline,
      staleDetails: summary.machines.staleDetails.map((machine) => ({
        ...machine,
        lastSeenAt: machine.lastSeenAt?.toISOString() ?? null,
      })),
    },
    sessions: {
      active: summary.sessions.active,
      stale: summary.sessions.stale,
      staleDetails: summary.sessions.staleDetails.map((session) => ({
        ...session,
        lastHeartbeatAt: session.lastHeartbeatAt?.toISOString() ?? null,
      })),
    },
    commands: {
      pending: summary.commands.pending,
      stuck: summary.commands.stuck,
      stuckDetails: summary.commands.stuckDetails.map((command) => ({
        ...command,
        createdAt: command.createdAt.toISOString(),
      })),
    },
    computedAt: summary.computedAt.toISOString(),
  };
}

@Controller("workspaces/:workspaceId/runtime")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RuntimeHealthController {
  constructor(private readonly getRuntimeHealthUseCase: GetRuntimeHealthUseCase) {}

  @Get("health")
  @RequirePermission("read_tasks")
  async health(@Param("workspaceId") workspaceId: string) {
    const summary = await this.getRuntimeHealthUseCase.execute(workspaceId);
    return toRuntimeHealthResponse(summary);
  }
}
