import { ActorType } from "@repo/db";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
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
import { AgentNotEligibleError, AgentNotFoundError } from "../application/agent-application.errors";
import { BackfillAgentPromptProfilesUseCase } from "../application/backfill-agent-prompt-profiles.use-case";
import { DisableAgentUseCase } from "../application/disable-agent.use-case";
import { EnableAgentUseCase } from "../application/enable-agent.use-case";
import { ForceAgentOfflineUseCase } from "../application/force-agent-offline.use-case";
import { GetAgentUseCase } from "../application/get-agent.use-case";
import { ListAgentsByWorkspaceUseCase } from "../application/list-agents-by-workspace.use-case";
import { ManageAgentCredentialUseCase } from "../application/manage-agent-credential.use-case";
import { RegisterAgentUseCase } from "../application/register-agent.use-case";
import { UpdateAgentDetailsUseCase } from "../application/update-agent-details.use-case";
import { UpdateAgentHealthUseCase } from "../application/update-agent-health.use-case";
import { Agent } from "../domain/agent";
import { PROVIDER_PROFILE_REPOSITORY, ProviderProfileRepository } from "../domain/ports/provider-profile.repository.port";
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
    disabledAt: agent.disabledAt?.toISOString() ?? null,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

function toHttpError(error: DomainError): Error {
  if (error instanceof AgentNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof AgentNotEligibleError) {
    return new ConflictException(error.message);
  }
  return new BadRequestException(error.message);
}

function ensureHuman(requester: AuthenticatedRequester): void {
  if (requester.type !== ActorType.HUMAN) {
    throw new ForbiddenException(
      "Only human users can create or manage agent credentials",
    );
  }
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
    private readonly backfillAgentPromptProfilesUseCase: BackfillAgentPromptProfilesUseCase,
    private readonly manageAgentCredentialUseCase: ManageAgentCredentialUseCase,
    private readonly disableAgentUseCase: DisableAgentUseCase,
    private readonly enableAgentUseCase: EnableAgentUseCase,
    @Inject(PROVIDER_PROFILE_REPOSITORY)
    private readonly providerProfiles: ProviderProfileRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("invite_agent")
  async register(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: RegisterAgentDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    ensureHuman(requester);
    const result = await this.registerAgentUseCase.execute({
      ...dto,
      workspaceId,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return {
      ...toAgentResponse(result.value.agent),
      token: result.value.plainTextToken,
    };
  }

  @Post("prompt-profiles/backfill")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("manage_workspace_rules")
  async backfillPromptProfiles(@Param("workspaceId") workspaceId: string) {
    const agents =
      await this.backfillAgentPromptProfilesUseCase.execute(workspaceId);
    return { updated: agents.map(toAgentResponse), count: agents.length };
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(
    @Param("workspaceId") workspaceId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const agents = await this.listAgentsByWorkspaceUseCase.execute(workspaceId);
    if (requester.type === ActorType.HUMAN) return agents.map(toAgentResponse);
    const profiles = await this.providerProfiles.list();
    const unavailable = new Set(
      profiles.filter((profile) => !profile.available).map((profile) => profile.provider),
    );
    return agents
      .filter((agent) => !unavailable.has(agent.provider))
      .map(toAgentResponse);
  }

  @Get(":agentId")
  @RequirePermission("read_tasks")
  async get(
    @Param("agentId") agentId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.getAgentUseCase.execute(agentId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    if (requester.type === ActorType.AGENT) {
      const profile = await this.providerProfiles.findByProvider(result.value.provider);
      if (profile?.available === false) throw new NotFoundException("Agent was not found");
    }
    return toAgentResponse(result.value);
  }

  @Patch(":agentId")
  @RequirePermission("create_task")
  async updateDetails(
    @Param("agentId") agentId: string,
    @Body() dto: UpdateAgentDetailsDto,
  ) {
    const result = await this.updateAgentDetailsUseCase.execute({
      agentId,
      ...dto,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toAgentResponse(result.value);
  }

  @Post(":agentId/health")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async updateHealth(
    @Param("agentId") agentId: string,
    @Body() dto: UpdateAgentHealthDto,
  ) {
    const result = await this.updateAgentHealthUseCase.execute({
      agentId,
      healthState: dto.healthState,
    });
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

  @Post(":agentId/disable")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("manage_workspace_rules")
  async disable(
    @Param("agentId") agentId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    ensureHuman(requester);
    const result = await this.disableAgentUseCase.execute(agentId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toAgentResponse(result.value);
  }

  @Post(":agentId/enable")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("manage_workspace_rules")
  async enable(
    @Param("agentId") agentId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    ensureHuman(requester);
    const result = await this.enableAgentUseCase.execute(agentId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return {
      ...toAgentResponse(result.value.agent),
      token: result.value.token,
    };
  }

  @Post(":agentId/token/rotate")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("manage_workspace_rules")
  async rotateToken(
    @Param("workspaceId") workspaceId: string,
    @Param("agentId") agentId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    ensureHuman(requester);
    return {
      token: await this.manageAgentCredentialUseCase.rotate(
        workspaceId,
        agentId,
      ),
    };
  }

  @Post(":agentId/token/revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("manage_workspace_rules")
  async revokeToken(
    @Param("workspaceId") workspaceId: string,
    @Param("agentId") agentId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ): Promise<void> {
    ensureHuman(requester);
    await this.manageAgentCredentialUseCase.revoke(workspaceId, agentId);
  }
}
