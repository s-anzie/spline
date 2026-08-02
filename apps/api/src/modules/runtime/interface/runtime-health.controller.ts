import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { JwtAuthGuard, PermissionsGuard, RequirePermission } from "../../identity/interface";
import { GetRuntimeHealthUseCase, RuntimeHealthSummary } from "../application/get-runtime-health.use-case";

function toRuntimeHealthResponse(summary: RuntimeHealthSummary) {
  return {
    machines: summary.machines,
    sessions: summary.sessions,
    commands: summary.commands,
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
