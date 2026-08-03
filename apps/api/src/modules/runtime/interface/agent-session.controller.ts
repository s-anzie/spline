import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard, PermissionsGuard, RequirePermission } from "../../identity/interface";
import { DomainError } from "../../../kernel/domain/domain-error";
import { ApproveAgentSessionUseCase } from "../application/approve-agent-session.use-case";
import { DenyAgentSessionUseCase } from "../application/deny-agent-session.use-case";
import { GetAgentSessionUseCase } from "../application/get-agent-session.use-case";
import { ListAgentSessionsByWorkspaceUseCase } from "../application/list-agent-sessions-by-workspace.use-case";
import { ListSessionOutputsUseCase } from "../application/list-session-outputs.use-case";
import { ReportSessionStatusUseCase } from "../application/report-session-status.use-case";
import {
  AgentSessionNotFoundError,
  MachineNotFoundError,
  MachineNotLinkedToWorkspaceError,
  AgentAlreadyHasActiveSessionError,
} from "../application/runtime-application.errors";
import { SendSessionHeartbeatUseCase } from "../application/send-session-heartbeat.use-case";
import { StartAgentSessionUseCase } from "../application/start-agent-session.use-case";
import { StopAgentSessionUseCase } from "../application/stop-agent-session.use-case";
import { AgentSession } from "../domain/agent-session";
import { InvalidAgentSessionStatusTransitionError } from "../domain/agent-session.errors";
import { AgentNotFoundError } from "../../agent/application/agent-application.errors";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { ReportSessionStatusDto } from "./dto/report-session-status.dto";
import { StartAgentSessionDto } from "./dto/start-agent-session.dto";
import { AuthenticatedRequester, CurrentRequester } from "../../identity/interface";

function toSessionResponse(session: AgentSession) {
  return {
    id: session.id.toString(),
    agentId: session.agentId,
    provider: session.provider,
    workspaceId: session.workspaceId,
    machineId: session.machineId,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    lastHeartbeatAt: session.lastHeartbeatAt?.toISOString() ?? null,
    currentProcessId: session.currentProcessId ?? null,
    currentTaskId: session.currentTaskId ?? null,
    approvalState: session.approvalState,
    providerSessionId: session.providerSessionId ?? null,
    resumedFromSessionId: session.resumedFromSessionId ?? null,
    instruction: session.instruction ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function toHttpError(error: DomainError): Error {
  if (
    error instanceof WorkspaceNotFoundError ||
    error instanceof AgentNotFoundError ||
    error instanceof MachineNotFoundError ||
    error instanceof AgentSessionNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/agent-sessions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgentSessionController {
  constructor(
    private readonly startAgentSessionUseCase: StartAgentSessionUseCase,
    private readonly stopAgentSessionUseCase: StopAgentSessionUseCase,
    private readonly sendSessionHeartbeatUseCase: SendSessionHeartbeatUseCase,
    private readonly reportSessionStatusUseCase: ReportSessionStatusUseCase,
    private readonly approveAgentSessionUseCase: ApproveAgentSessionUseCase,
    private readonly denyAgentSessionUseCase: DenyAgentSessionUseCase,
    private readonly getAgentSessionUseCase: GetAgentSessionUseCase,
    private readonly listAgentSessionsByWorkspaceUseCase: ListAgentSessionsByWorkspaceUseCase,
    private readonly listSessionOutputsUseCase: ListSessionOutputsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("start_process")
  async start(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: StartAgentSessionDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.startAgentSessionUseCase.execute({
      ...dto,
      workspaceId,
      requesterType: requester.type,
    });
    if (result.isFailure) {
      if (result.error instanceof AgentAlreadyHasActiveSessionError) {
        throw new BadRequestException(result.error.message);
      }
      if (result.error instanceof MachineNotLinkedToWorkspaceError) {
        throw new BadRequestException(result.error.message);
      }
      throw toHttpError(result.error);
    }
    return toSessionResponse(result.value);
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string) {
    const sessions = await this.listAgentSessionsByWorkspaceUseCase.execute(workspaceId);
    return sessions.map(toSessionResponse);
  }

  @Get(":sessionId")
  @RequirePermission("read_tasks")
  async get(@Param("sessionId") sessionId: string) {
    const result = await this.getAgentSessionUseCase.execute(sessionId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toSessionResponse(result.value);
  }

  @Get(":sessionId/outputs")
  @RequirePermission("read_tasks")
  async outputs(
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.listSessionOutputsUseCase.execute(workspaceId, sessionId);
  }

  @Post(":sessionId/stop")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("stop_process")
  async stop(@Param("sessionId") sessionId: string) {
    const result = await this.stopAgentSessionUseCase.execute({ sessionId });
    if (result.isFailure) {
      if (result.error instanceof InvalidAgentSessionStatusTransitionError) {
        throw new BadRequestException(result.error.message);
      }
      throw toHttpError(result.error);
    }
    return toSessionResponse(result.value);
  }

  @Post(":sessionId/heartbeat")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("acquire_lock")
  async heartbeat(@Param("sessionId") sessionId: string) {
    const result = await this.sendSessionHeartbeatUseCase.execute({ sessionId });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toSessionResponse(result.value);
  }

  @Post(":sessionId/report")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async report(@Param("sessionId") sessionId: string, @Body() dto: ReportSessionStatusDto) {
    const result = await this.reportSessionStatusUseCase.execute({ sessionId, status: dto.status });
    if (result.isFailure) {
      if (result.error instanceof InvalidAgentSessionStatusTransitionError) {
        throw new BadRequestException(result.error.message);
      }
      throw toHttpError(result.error);
    }
    return toSessionResponse(result.value);
  }

  @Post(":sessionId/approve")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("validate_decision")
  async approve(@Param("sessionId") sessionId: string) {
    const result = await this.approveAgentSessionUseCase.execute({ sessionId });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toSessionResponse(result.value);
  }

  @Post(":sessionId/deny")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("validate_decision")
  async deny(@Param("sessionId") sessionId: string) {
    const result = await this.denyAgentSessionUseCase.execute({ sessionId });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toSessionResponse(result.value);
  }
}
