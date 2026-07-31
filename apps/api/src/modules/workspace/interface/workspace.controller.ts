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
import { ArchiveWorkspaceUseCase } from "../application/archive-workspace.use-case";
import { CreateWorkspaceUseCase } from "../application/create-workspace.use-case";
import { DuplicateWorkspaceUseCase } from "../application/duplicate-workspace.use-case";
import { GetWorkspaceUseCase } from "../application/get-workspace.use-case";
import { ListWorkspacesUseCase } from "../application/list-workspaces.use-case";
import { RenameWorkspaceUseCase } from "../application/rename-workspace.use-case";
import { UpdateWorkspaceRulesetUseCase } from "../application/update-workspace-ruleset.use-case";
import { WorkspaceNotFoundError } from "../application/workspace-application.errors";
import { Workspace } from "../domain/workspace";
import { WorkspaceArchivedError } from "../domain/workspace.errors";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { DuplicateWorkspaceDto } from "./dto/duplicate-workspace.dto";
import { RenameWorkspaceDto } from "./dto/rename-workspace.dto";
import { UpdateWorkspaceRulesetDto } from "./dto/update-workspace-ruleset.dto";

function toWorkspaceResponse(workspace: Workspace) {
  return {
    id: workspace.id.toString(),
    name: workspace.name,
    description: workspace.description ?? null,
    status: workspace.status,
    ruleset: workspace.ruleset,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

function toHttpError(error: DomainError): Error {
  if (error instanceof WorkspaceNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof WorkspaceArchivedError) {
    return new ConflictException(error.message);
  }
  return new BadRequestException(error.message);
}

function ensureHuman(requester: AuthenticatedRequester): void {
  if (requester.type !== ActorType.HUMAN) {
    throw new ForbiddenException("Only human users can perform this action");
  }
}

@Controller("workspaces")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkspaceController {
  constructor(
    private readonly createWorkspaceUseCase: CreateWorkspaceUseCase,
    private readonly renameWorkspaceUseCase: RenameWorkspaceUseCase,
    private readonly archiveWorkspaceUseCase: ArchiveWorkspaceUseCase,
    private readonly duplicateWorkspaceUseCase: DuplicateWorkspaceUseCase,
    private readonly getWorkspaceUseCase: GetWorkspaceUseCase,
    private readonly listWorkspacesUseCase: ListWorkspacesUseCase,
    private readonly updateWorkspaceRulesetUseCase: UpdateWorkspaceRulesetUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentRequester() requester: AuthenticatedRequester,
    @Body() dto: CreateWorkspaceDto,
  ) {
    ensureHuman(requester);
    const result = await this.createWorkspaceUseCase.execute({ ...dto, ownerId: requester.id });
    if (result.isFailure) {
      throw new BadRequestException(result.error.message);
    }
    return toWorkspaceResponse(result.value);
  }

  @Get()
  async list(@CurrentRequester() requester: AuthenticatedRequester) {
    const workspaces = await this.listWorkspacesUseCase.execute(requester.type, requester.id);
    return workspaces.map(toWorkspaceResponse);
  }

  @Get(":workspaceId")
  @RequirePermission("read_tasks")
  async get(@Param("workspaceId") workspaceId: string) {
    const result = await this.getWorkspaceUseCase.execute(workspaceId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toWorkspaceResponse(result.value);
  }

  @Patch(":workspaceId")
  @RequirePermission("manage_workspace_rules")
  async rename(@Param("workspaceId") workspaceId: string, @Body() dto: RenameWorkspaceDto) {
    const result = await this.renameWorkspaceUseCase.execute({ workspaceId, newName: dto.name });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toWorkspaceResponse(result.value);
  }

  @Patch(":workspaceId/ruleset")
  @RequirePermission("manage_workspace_rules")
  async updateRuleset(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: UpdateWorkspaceRulesetDto,
  ) {
    const result = await this.updateWorkspaceRulesetUseCase.execute({
      workspaceId,
      ruleset: dto.ruleset,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toWorkspaceResponse(result.value);
  }

  @Post(":workspaceId/archive")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("manage_workspace_rules")
  async archive(@Param("workspaceId") workspaceId: string) {
    const result = await this.archiveWorkspaceUseCase.execute(workspaceId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toWorkspaceResponse(result.value);
  }

  @Post(":workspaceId/duplicate")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("manage_workspace_rules")
  async duplicate(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: DuplicateWorkspaceDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    ensureHuman(requester);
    const result = await this.duplicateWorkspaceUseCase.execute({
      workspaceId,
      newName: dto.name,
      ownerId: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toWorkspaceResponse(result.value);
  }
}
