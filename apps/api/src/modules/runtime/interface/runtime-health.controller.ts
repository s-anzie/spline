import { Controller, Get, HttpCode, HttpStatus, Inject, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard, PermissionsGuard, RequirePermission } from "../../identity/interface";
import { GetRuntimeHealthUseCase, RuntimeHealthSummary } from "../application/get-runtime-health.use-case";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { RUNTIME_COMMAND_REPOSITORY, RuntimeCommandRepository } from "../domain/ports/runtime-command.repository.port";
import { RuntimeCommandStatus } from "@repo/db";

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
  constructor(
    private readonly getRuntimeHealthUseCase: GetRuntimeHealthUseCase,
    @Inject(RUNTIME_COMMAND_REPOSITORY)
    private readonly commands: RuntimeCommandRepository,
  ) {}

  @Get("health")
  @RequirePermission("read_tasks")
  async health(@Param("workspaceId") workspaceId: string) {
    const summary = await this.getRuntimeHealthUseCase.execute(workspaceId);
    return toRuntimeHealthResponse(summary);
  }

  @Post("commands/:commandId/cancel")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("start_process")
  async cancelCommand(
    @Param("workspaceId") workspaceId: string,
    @Param("commandId") commandId: string,
  ) {
    const command = await this.commands.findById(UniqueEntityId.create(commandId));
    if (!command || command.workspaceId !== workspaceId)
      throw new NotFoundException("Runtime command not found");
    if (
      command.status === RuntimeCommandStatus.COMPLETED ||
      command.status === RuntimeCommandStatus.FAILED
    )
      return { id: command.id.toString(), status: command.status };
    command.markFailed();
    await this.commands.save(command);
    return { id: command.id.toString(), status: command.status };
  }
}
