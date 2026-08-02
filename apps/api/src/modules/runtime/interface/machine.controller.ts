import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface";
import { DomainError } from "../../../kernel/domain/domain-error";
import { LinkMachineToWorkspaceUseCase } from "../application/link-machine-to-workspace.use-case";
import { ListMachinesByWorkspaceUseCase } from "../application/list-machines-by-workspace.use-case";
import { ManageMachineCredentialUseCase } from "../application/manage-machine-credential.use-case";
import { MachineNotFoundError } from "../application/runtime-application.errors";
import { LocalMachine } from "../domain/local-machine";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { MachineGateway } from "./machine.gateway";

function toMachineResponse(machine: LocalMachine) {
  return {
    id: machine.id.toString(),
    hostname: machine.hostname,
    os: machine.os,
    workspaceIds: machine.workspaceIds,
    runtimeStatus: machine.runtimeStatus,
    lastSeenAt: machine.lastSeenAt?.toISOString() ?? null,
    createdAt: machine.createdAt.toISOString(),
    updatedAt: machine.updatedAt.toISOString(),
  };
}

function toHttpError(error: DomainError): Error {
  if (
    error instanceof WorkspaceNotFoundError ||
    error instanceof MachineNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/machines")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MachineController {
  constructor(
    private readonly linkMachineToWorkspaceUseCase: LinkMachineToWorkspaceUseCase,
    private readonly listMachinesByWorkspaceUseCase: ListMachinesByWorkspaceUseCase,
    private readonly manageMachineCredential: ManageMachineCredentialUseCase,
    private readonly machineGateway: MachineGateway,
  ) {}

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string) {
    const machines =
      await this.listMachinesByWorkspaceUseCase.execute(workspaceId);
    return machines.map(toMachineResponse);
  }

  @Post(":machineId/link")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("manage_workspace_rules")
  async link(
    @Param("workspaceId") workspaceId: string,
    @Param("machineId") machineId: string,
  ) {
    const result = await this.linkMachineToWorkspaceUseCase.execute({
      workspaceId,
      machineId,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toMachineResponse(result.value);
  }

  @Post(":machineId/token/rotate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("manage_workspace_rules")
  async rotateToken(
    @Param("workspaceId") workspaceId: string,
    @Param("machineId") machineId: string,
  ) {
    try {
      const token = await this.manageMachineCredential.rotate(
        workspaceId,
        machineId,
      );
      this.machineGateway.disconnectMachine(machineId);
      return { token };
    } catch (error) {
      if (error instanceof DomainError) throw toHttpError(error);
      throw error;
    }
  }

  @Post(":machineId/token/revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("manage_workspace_rules")
  async revokeToken(
    @Param("workspaceId") workspaceId: string,
    @Param("machineId") machineId: string,
  ) {
    try {
      await this.manageMachineCredential.revoke(workspaceId, machineId);
      this.machineGateway.disconnectMachine(machineId);
    } catch (error) {
      if (error instanceof DomainError) throw toHttpError(error);
      throw error;
    }
  }
}
