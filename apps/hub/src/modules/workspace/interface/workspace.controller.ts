import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  GoneException,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  BootstrapOperation,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { ChangeWorkspaceStatusUseCase } from "../application/change-workspace-status.use-case";
import { CreateWorkspaceUseCase } from "../application/create-workspace.use-case";
import { GetWorkspaceUseCase } from "../application/get-workspace.use-case";
import { ListWorkspacesForActorUseCase } from "../application/list-workspaces-for-actor.use-case";
import { UpdateWorkspaceDetailsUseCase } from "../application/update-workspace-details.use-case";
import { Workspace, WorkspaceStatus } from "../domain/workspace";
import { CreateWorkspaceDto, UpdateWorkspaceDto } from "./dto/workspace.dtos";

interface WorkspaceView {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  settings: Record<string, unknown>;
  /** §20.6 — the transitions a client may offer, straight from the machine. */
  allowedStatusTargets: readonly string[];
  createdAt: string;
  updatedAt: string;
}

function toView(workspace: Workspace): WorkspaceView {
  return {
    id: workspace.id.value,
    organizationId: workspace.organizationId,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    status: workspace.status,
    settings: workspace.settings,
    allowedStatusTargets: workspace.allowedStatusTargets(),
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

@Controller()
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class WorkspaceController {
  constructor(
    private readonly createWorkspace: CreateWorkspaceUseCase,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly listWorkspaces: ListWorkspacesForActorUseCase,
    private readonly updateWorkspace: UpdateWorkspaceDetailsUseCase,
    private readonly changeStatus: ChangeWorkspaceStatusUseCase,
  ) {}

  @Post("workspaces")
  @BootstrapOperation("workspace-create")
  async create(
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<{ workspaceId: string; slug: string }> {
    if (actor.actorType !== "HUMAN") {
      throw new ForbiddenException(
        "Workspace creation founds human ownership — agents operate inside a workspace, never above it",
      );
    }
    const result = await this.createWorkspace.execute({
      ...dto,
      creatorUserId: actor.actorId,
    });
    if (result.isFailure) {
      if (result.error.name === "OrganizationNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      if (result.error.name === "NotOrganizationOwnerError") {
        throw new ForbiddenException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return result.value;
  }

  @Get("workspaces")
  async listMine(@CurrentActor() actor: ActorIdentity): Promise<WorkspaceView[]> {
    const result = await this.listWorkspaces.execute(actor);
    if (result.isFailure) {
      throw new BadRequestException(result.error.message);
    }
    return result.value.map(toView);
  }

  @Get("workspaces/:workspaceId")
  @RequirePermission("read_workspace_state")
  async get(@Param("workspaceId") workspaceId: string): Promise<WorkspaceView> {
    const result = await this.getWorkspace.execute({ workspaceId });
    if (result.isFailure) {
      throw new NotFoundException(result.error.message);
    }
    return toView(result.value);
  }

  @Patch("workspaces/:workspaceId")
  @RequirePermission("manage_workspace")
  async update(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<{ ok: true }> {
    const result = await this.updateWorkspace.execute({ workspaceId, ...dto });
    if (result.isFailure) {
      if (result.error.name === "WorkspaceNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return { ok: true };
  }

  /**
   * The operational lever: freezing and resuming execution is piloting, so a
   * human operator holds it — an incident must not wait for the owner.
   */
  @Post("workspaces/:workspaceId/pause")
  @HttpCode(200)
  @RequirePermission("operate_workspace")
  async pause(@Param("workspaceId") workspaceId: string): Promise<{ ok: true }> {
    return this.transition(workspaceId, "PAUSED");
  }

  @Post("workspaces/:workspaceId/resume")
  @HttpCode(200)
  @RequirePermission("operate_workspace")
  async resume(@Param("workspaceId") workspaceId: string): Promise<{ ok: true }> {
    return this.transition(workspaceId, "ACTIVE");
  }

  /** End-of-life is ownership-level, never operational. */
  @Post("workspaces/:workspaceId/archive")
  @HttpCode(200)
  @RequirePermission("manage_workspace")
  async archive(@Param("workspaceId") workspaceId: string): Promise<{ ok: true }> {
    return this.transition(workspaceId, "ARCHIVED");
  }

  @Post("workspaces/:workspaceId/unarchive")
  @HttpCode(200)
  @RequirePermission("manage_workspace")
  async unarchive(@Param("workspaceId") workspaceId: string): Promise<{ ok: true }> {
    return this.transition(workspaceId, "ACTIVE");
  }

  @Post("workspaces/:workspaceId/delete")
  @HttpCode(200)
  @RequirePermission("manage_workspace")
  async remove(@Param("workspaceId") workspaceId: string): Promise<{ ok: true }> {
    return this.transition(workspaceId, "DELETED");
  }

  private async transition(
    workspaceId: string,
    status: WorkspaceStatus,
  ): Promise<{ ok: true }> {
    const result = await this.changeStatus.execute({ workspaceId, status });
    if (result.isFailure) {
      if (result.error.name === "WorkspaceNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      const transition = result.error as InvalidStateTransitionError;
      // fromTerminal distinguishes "gone for good" (410) from "conflict" (409).
      throw transition.fromTerminal
        ? new GoneException(transition.message)
        : new ConflictException(transition.message);
    }
    return { ok: true };
  }
}
