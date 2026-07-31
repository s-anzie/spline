import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  AuthenticatedRequester,
  CurrentRequester,
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface";
import { DomainError } from "../../../kernel/domain/domain-error";
import { GetProcessUseCase } from "../application/get-process.use-case";
import { ListProcessesByWorkspaceUseCase } from "../application/list-processes-by-workspace.use-case";
import { RegisterProcessUseCase } from "../application/register-process.use-case";
import { RestartProcessUseCase } from "../application/restart-process.use-case";
import {
  MachineNotFoundError,
  MachineNotLinkedToWorkspaceError,
  ProcessCwdOutsideWorkspaceRootError,
  ProcessNotFoundError,
  ProcessNotLockedByRequesterError,
  WorkspaceRootPathNotConfiguredError,
} from "../application/runtime-application.errors";
import { StartProcessUseCase } from "../application/start-process.use-case";
import { StopProcessUseCase } from "../application/stop-process.use-case";
import { Process } from "../domain/process";
import { EmptyProcessCommandError, EmptyProcessNameError } from "../domain/process.errors";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { RegisterProcessDto } from "./dto/register-process.dto";
import { StartProcessDto } from "./dto/start-process.dto";

function toProcessResponse(process: Process) {
  return {
    id: process.id.toString(),
    workspaceId: process.workspaceId,
    name: process.name,
    command: process.command,
    cwd: process.cwd,
    env: process.env,
    status: process.status,
    ownerAgentId: process.ownerAgentId ?? null,
    ownerSessionId: process.ownerSessionId ?? null,
    machineId: process.machineId ?? null,
    pid: process.pid ?? null,
    ports: process.ports,
    logsRef: process.logsRef ?? null,
    restartPolicy: process.restartPolicy,
    createdAt: process.createdAt.toISOString(),
    updatedAt: process.updatedAt.toISOString(),
  };
}

function toHttpError(error: DomainError): Error {
  if (
    error instanceof WorkspaceNotFoundError ||
    error instanceof ProcessNotFoundError ||
    error instanceof MachineNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  if (error instanceof ProcessNotLockedByRequesterError) {
    return new ForbiddenException(error.message);
  }
  if (
    error instanceof EmptyProcessNameError ||
    error instanceof EmptyProcessCommandError ||
    error instanceof WorkspaceRootPathNotConfiguredError ||
    error instanceof ProcessCwdOutsideWorkspaceRootError ||
    error instanceof MachineNotLinkedToWorkspaceError
  ) {
    return new BadRequestException(error.message);
  }
  return new ConflictException(error.message);
}

@Controller("workspaces/:workspaceId/processes")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProcessController {
  constructor(
    private readonly registerProcessUseCase: RegisterProcessUseCase,
    private readonly getProcessUseCase: GetProcessUseCase,
    private readonly listProcessesByWorkspaceUseCase: ListProcessesByWorkspaceUseCase,
    private readonly startProcessUseCase: StartProcessUseCase,
    private readonly stopProcessUseCase: StopProcessUseCase,
    private readonly restartProcessUseCase: RestartProcessUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async register(@Param("workspaceId") workspaceId: string, @Body() dto: RegisterProcessDto) {
    const result = await this.registerProcessUseCase.execute({ ...dto, workspaceId });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toProcessResponse(result.value);
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string) {
    const processes = await this.listProcessesByWorkspaceUseCase.execute(workspaceId);
    return processes.map(toProcessResponse);
  }

  @Get(":processId")
  @RequirePermission("read_tasks")
  async get(@Param("processId") processId: string) {
    const result = await this.getProcessUseCase.execute(processId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toProcessResponse(result.value);
  }

  @Post(":processId/start")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("start_process")
  async start(
    @Param("workspaceId") workspaceId: string,
    @Param("processId") processId: string,
    @Body() dto: StartProcessDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.startProcessUseCase.execute({
      workspaceId,
      processId,
      machineId: dto.machineId,
      requester: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toProcessResponse(result.value);
  }

  @Post(":processId/stop")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("stop_process")
  async stop(
    @Param("workspaceId") workspaceId: string,
    @Param("processId") processId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.stopProcessUseCase.execute({
      workspaceId,
      processId,
      requester: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toProcessResponse(result.value);
  }

  @Post(":processId/restart")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("stop_process")
  async restart(
    @Param("workspaceId") workspaceId: string,
    @Param("processId") processId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.restartProcessUseCase.execute({
      workspaceId,
      processId,
      requester: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toProcessResponse(result.value);
  }
}
