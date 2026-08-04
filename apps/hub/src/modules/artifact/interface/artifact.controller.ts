import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  GoneException,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorType } from "../../identity/domain/actor";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { AddArtifactVersionUseCase } from "../application/add-artifact-version.use-case";
import { ChangeArtifactStatusUseCase } from "../application/change-artifact-status.use-case";
import { CreateArtifactUseCase } from "../application/create-artifact.use-case";
import { GetArtifactUseCase } from "../application/get-artifact.use-case";
import { LinkArtifactUseCase } from "../application/link-artifact.use-case";
import { ListArtifactsUseCase } from "../application/list-artifacts.use-case";
import { UpdateArtifactMetadataUseCase } from "../application/update-artifact-metadata.use-case";
import { Artifact, ArtifactStatus } from "../domain/artifact";
import {
  AddArtifactVersionDto,
  ChangeArtifactStatusDto,
  CreateArtifactDto,
  LinkArtifactDto,
  UnlinkArtifactDto,
  UpdateArtifactDto,
} from "./dto/artifact.dtos";

interface ArtifactView {
  id: string;
  workspaceId: string;
  goalId: string | null;
  taskId: string | null;
  repositoryId: string | null;
  type: string;
  name: string;
  description: string | null;
  status: string;
  currentVersion: number;
  versions: {
    version: number;
    checksum: string;
    storageRef: string;
    sizeBytes: number | null;
    note: string | null;
    createdBy: { type: string; id: string };
    createdAt: string;
  }[];
  tags: readonly string[];
  metadata: Record<string, unknown>;
  immutable: boolean;
  createdBy: { type: string; id: string };
  allowedStatusTargets: readonly string[];
  createdAt: string;
  updatedAt: string;
}

function toView(artifact: Artifact): ArtifactView {
  return {
    id: artifact.id.value,
    workspaceId: artifact.workspaceId,
    goalId: artifact.goalId,
    taskId: artifact.taskId,
    repositoryId: artifact.repositoryId,
    type: artifact.type,
    name: artifact.name,
    description: artifact.description,
    status: artifact.status,
    currentVersion: artifact.currentVersion,
    versions: artifact.versions.map((version) => ({
      version: version.version,
      checksum: version.checksum,
      storageRef: version.storageRef,
      sizeBytes: version.sizeBytes,
      note: version.note,
      createdBy: { type: version.createdBy.type, id: version.createdBy.actorId },
      createdAt: version.createdAt.toISOString(),
    })),
    tags: artifact.tags,
    metadata: artifact.metadata,
    immutable: artifact.immutable,
    createdBy: { type: artifact.createdBy.type, id: artifact.createdBy.actorId },
    allowedStatusTargets: artifact.allowedStatusTargets(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

@Controller("workspaces/:workspaceId/artifacts")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class ArtifactController {
  constructor(
    private readonly createArtifact: CreateArtifactUseCase,
    private readonly addVersion: AddArtifactVersionUseCase,
    private readonly getArtifact: GetArtifactUseCase,
    private readonly listArtifacts: ListArtifactsUseCase,
    private readonly updateArtifact: UpdateArtifactMetadataUseCase,
    private readonly linkArtifact: LinkArtifactUseCase,
    private readonly changeStatus: ChangeArtifactStatusUseCase,
  ) {}

  /** Producing a trace is an act of execution: a working agent produces them. */
  @Post()
  @RequirePermission("execute_tasks")
  async create(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: CreateArtifactDto,
  ): Promise<{ artifactId: string; version: number }> {
    const result = await this.createArtifact.execute({
      workspaceId,
      ...dto,
      createdByType: actor.actorType,
      createdById: actor.actorId,
    });
    if (result.isFailure) {
      if (result.error.name === "WorkspaceNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return result.value;
  }

  @Post(":artifactId/versions")
  @RequirePermission("execute_tasks")
  async version(
    @Param("workspaceId") workspaceId: string,
    @Param("artifactId") artifactId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: AddArtifactVersionDto,
  ): Promise<{ version: number }> {
    const result = await this.addVersion.execute({
      artifactId,
      workspaceId,
      ...dto,
      createdByType: actor.actorType,
      createdById: actor.actorId,
    });
    if (result.isFailure) {
      if (result.error.name === "ArtifactNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      // Immutability and archival are state conflicts, not bad input.
      if (
        result.error.name === "ImmutableArtifactError" ||
        result.error.name === "ArtifactNotActiveError"
      ) {
        throw new ConflictException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return result.value;
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query("type") type?: string,
    @Query("goalId") goalId?: string,
    @Query("taskId") taskId?: string,
    @Query("repositoryId") repositoryId?: string,
    @Query("tag") tag?: string,
    @Query("status") status?: ArtifactStatus,
    @Query("createdByType") createdByType?: ActorType,
    @Query("createdById") createdById?: string,
  ): Promise<ArtifactView[]> {
    const result = await this.listArtifacts.execute({
      workspaceId,
      ...(type !== undefined && { type }),
      ...(goalId !== undefined && { goalId }),
      ...(taskId !== undefined && { taskId }),
      ...(repositoryId !== undefined && { repositoryId }),
      ...(tag !== undefined && { tags: [tag] }),
      ...(status !== undefined && { statuses: [status] }),
      ...(createdByType !== undefined && { createdByType }),
      ...(createdById !== undefined && { createdById }),
    });
    return result.value.map(toView);
  }

  @Get(":artifactId")
  @RequirePermission("read_workspace_state")
  async get(
    @Param("workspaceId") workspaceId: string,
    @Param("artifactId") artifactId: string,
  ): Promise<ArtifactView> {
    const result = await this.getArtifact.execute({ artifactId, workspaceId });
    if (result.isFailure) {
      throw new NotFoundException(result.error.message);
    }
    return toView(result.value);
  }

  @Patch(":artifactId")
  @RequirePermission("execute_tasks")
  async update(
    @Param("workspaceId") workspaceId: string,
    @Param("artifactId") artifactId: string,
    @Body() dto: UpdateArtifactDto,
  ): Promise<{ ok: true }> {
    return this.unwrap(
      await this.updateArtifact.execute({ artifactId, workspaceId, ...dto }),
    );
  }

  @Post(":artifactId/links")
  @HttpCode(200)
  @RequirePermission("manage_tasks")
  async link(
    @Param("workspaceId") workspaceId: string,
    @Param("artifactId") artifactId: string,
    @Body() dto: LinkArtifactDto,
  ): Promise<{ ok: true }> {
    return this.unwrap(
      await this.linkArtifact.execute({
        artifactId,
        workspaceId,
        operation: "link",
        ...dto,
      }),
    );
  }

  @Post(":artifactId/unlinks")
  @HttpCode(200)
  @RequirePermission("manage_tasks")
  async unlink(
    @Param("workspaceId") workspaceId: string,
    @Param("artifactId") artifactId: string,
    @Body() dto: UnlinkArtifactDto,
  ): Promise<{ ok: true }> {
    return this.unwrap(
      await this.linkArtifact.execute({
        artifactId,
        workspaceId,
        operation: "unlink",
        ...dto,
      }),
    );
  }

  /** Archiving and logical deletion are stewardship, not execution. */
  @Post(":artifactId/status")
  @HttpCode(200)
  @RequirePermission("manage_tasks")
  async status(
    @Param("workspaceId") workspaceId: string,
    @Param("artifactId") artifactId: string,
    @Body() dto: ChangeArtifactStatusDto,
  ): Promise<{ ok: true }> {
    return this.unwrap(
      await this.changeStatus.execute({ artifactId, workspaceId, status: dto.status }),
    );
  }

  private unwrap(result: {
    isFailure: boolean;
    error: { name: string; message: string };
  }): { ok: true } {
    if (!result.isFailure) {
      return { ok: true };
    }
    const { name, message } = result.error;
    if (name.endsWith("NotFoundError")) {
      throw new NotFoundException(message);
    }
    if (name === "ImmutableArtifactError" || name === "ArtifactNotActiveError") {
      throw new ConflictException(message);
    }
    if (name === "InvalidStateTransitionError") {
      const transition = result.error as InvalidStateTransitionError;
      throw transition.fromTerminal
        ? new GoneException(message)
        : new ConflictException(message);
    }
    throw new BadRequestException(message);
  }
}
