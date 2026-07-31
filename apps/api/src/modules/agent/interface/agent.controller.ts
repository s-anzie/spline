import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard, PermissionsGuard, RequirePermission } from "../../identity/interface";
import { DomainError } from "../../../kernel/domain/domain-error";
import { AgentNotFoundError } from "../application/agent-application.errors";
import { ForceAgentOfflineUseCase } from "../application/force-agent-offline.use-case";
import { GetAgentUseCase } from "../application/get-agent.use-case";
import { ListAgentsByWorkspaceUseCase } from "../application/list-agents-by-workspace.use-case";
import { RegisterAgentUseCase } from "../application/register-agent.use-case";
import { UpdateAgentDetailsUseCase } from "../application/update-agent-details.use-case";
import { UpdateAgentHealthUseCase } from "../application/update-agent-health.use-case";
import { Agent } from "../domain/agent";
import { RegisterAgentDto } from "./dto/register-agent.dto";
import { UpdateAgentDetailsDto } from "./dto/update-agent-details.dto";
import { UpdateAgentHealthDto } from "./dto/update-agent-health.dto";

function toAgentResponse(agent: Agent) {
  return {
    id: agent.id.toString(),
    workspaceId: agent.workspaceId,
    provider: agent.provider,
    displayName: agent.displayName,
    capabilities: agent.capabilities,
    status: agent.status,
    currentTaskId: agent.currentTaskId ?? null,
    lastSeenAt: agent.lastSeenAt?.toISOString() ?? null,
    promptProfile: agent.promptProfile,
    permissions: agent.permissions,
    healthState: agent.healthState,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

function toHttpError(error: DomainError): Error {
  if (error instanceof AgentNotFoundError) {
    return new NotFoundException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/agents")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgentController {
  constructor(
    private readonly registerAgentUseCase: RegisterAgentUseCase,
    private readonly getAgentUseCase: GetAgentUseCase,
    private readonly listAgentsByWorkspaceUseCase: ListAgentsByWorkspaceUseCase,
    private readonly updateAgentDetailsUseCase: UpdateAgentDetailsUseCase,
    private readonly updateAgentHealthUseCase: UpdateAgentHealthUseCase,
    private readonly forceAgentOfflineUseCase: ForceAgentOfflineUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("invite_agent")
  async register(@Param("workspaceId") workspaceId: string, @Body() dto: RegisterAgentDto) {
    const result = await this.registerAgentUseCase.execute({ ...dto, workspaceId });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return { ...toAgentResponse(result.value.agent), token: result.value.plainTextToken };
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string) {
    const agents = await this.listAgentsByWorkspaceUseCase.execute(workspaceId);
    return agents.map(toAgentResponse);
  }

  @Get(":agentId")
  @RequirePermission("read_tasks")
  async get(@Param("agentId") agentId: string) {
    const result = await this.getAgentUseCase.execute(agentId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toAgentResponse(result.value);
  }

  @Patch(":agentId")
  @RequirePermission("create_task")
  async updateDetails(@Param("agentId") agentId: string, @Body() dto: UpdateAgentDetailsDto) {
    const result = await this.updateAgentDetailsUseCase.execute({ agentId, ...dto });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toAgentResponse(result.value);
  }

  @Post(":agentId/health")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async updateHealth(@Param("agentId") agentId: string, @Body() dto: UpdateAgentHealthDto) {
    const result = await this.updateAgentHealthUseCase.execute({ agentId, healthState: dto.healthState });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toAgentResponse(result.value);
  }

  @Post(":agentId/offline")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("manage_workspace_rules")
  async forceOffline(@Param("agentId") agentId: string) {
    const result = await this.forceAgentOfflineUseCase.execute(agentId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toAgentResponse(result.value);
  }
}
