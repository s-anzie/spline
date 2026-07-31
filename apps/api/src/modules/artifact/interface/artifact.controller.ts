import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
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
import { AddArtifactVersionUseCase } from "../application/add-artifact-version.use-case";
import { ArchiveArtifactUseCase } from "../application/archive-artifact.use-case";
import {
  ArtifactNotFoundError,
  LinkedGoalNotInWorkspaceError,
  LinkedTaskNotInWorkspaceError,
} from "../application/artifact-application.errors";
import { CreateArtifactUseCase } from "../application/create-artifact.use-case";
import { DeleteArtifactUseCase } from "../application/delete-artifact.use-case";
import { GetArtifactUseCase } from "../application/get-artifact.use-case";
import { LinkArtifactUseCase } from "../application/link-artifact.use-case";
import { ListArtifactsUseCase } from "../application/list-artifacts.use-case";
import { UnlinkArtifactUseCase } from "../application/unlink-artifact.use-case";
import { UpdateArtifactMetadataUseCase } from "../application/update-artifact-metadata.use-case";
import { Artifact } from "../domain/artifact";
import { ArtifactArchivedError } from "../domain/artifact.errors";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { AddArtifactVersionDto } from "./dto/add-artifact-version.dto";
import { CreateArtifactDto } from "./dto/create-artifact.dto";
import { LinkArtifactDto } from "./dto/link-artifact.dto";
import { UnlinkArtifactDto } from "./dto/unlink-artifact.dto";
import { UpdateArtifactMetadataDto } from "./dto/update-artifact-metadata.dto";

function toArtifactResponse(artifact: Artifact) {
  return {
    id: artifact.id.toString(),
    workspaceId: artifact.workspaceId,
    goalId: artifact.goalId ?? null,
    taskId: artifact.taskId ?? null,
    decisionId: artifact.decisionId ?? null,
    processId: artifact.processId ?? null,
    type: artifact.type,
    name: artifact.name,
    description: artifact.description ?? null,
    status: artifact.status,
    version: artifact.version,
    versions: artifact.versions,
    source: artifact.source ?? null,
    contentRef: artifact.contentRef ?? null,
    checksum: artifact.checksum ?? null,
    createdByType: artifact.createdByType,
    createdById: artifact.createdById,
    updatedByType: artifact.updatedByType ?? null,
    updatedById: artifact.updatedById ?? null,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

function toHttpError(error: DomainError): Error {
  if (
    error instanceof ArtifactNotFoundError ||
    error instanceof WorkspaceNotFoundError ||
    error instanceof LinkedGoalNotInWorkspaceError ||
    error instanceof LinkedTaskNotInWorkspaceError
  ) {
    return new NotFoundException(error.message);
  }
  if (error instanceof ArtifactArchivedError) {
    return new ConflictException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/artifacts")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ArtifactController {
  constructor(
    private readonly createArtifactUseCase: CreateArtifactUseCase,
    private readonly getArtifactUseCase: GetArtifactUseCase,
    private readonly listArtifactsUseCase: ListArtifactsUseCase,
    private readonly updateArtifactMetadataUseCase: UpdateArtifactMetadataUseCase,
    private readonly addArtifactVersionUseCase: AddArtifactVersionUseCase,
    private readonly linkArtifactUseCase: LinkArtifactUseCase,
    private readonly unlinkArtifactUseCase: UnlinkArtifactUseCase,
    private readonly archiveArtifactUseCase: ArchiveArtifactUseCase,
    private readonly deleteArtifactUseCase: DeleteArtifactUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async create(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateArtifactDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.createArtifactUseCase.execute({
      ...dto,
      workspaceId,
      createdBy: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toArtifactResponse(result.value);
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query("goalId") goalId?: string,
    @Query("taskId") taskId?: string,
    @Query("decisionId") decisionId?: string,
    @Query("processId") processId?: string,
  ) {
    const artifacts = await this.listArtifactsUseCase.execute({
      workspaceId,
      goalId,
      taskId,
      decisionId,
      processId,
    });
    return artifacts.map(toArtifactResponse);
  }

  @Get(":artifactId")
  @RequirePermission("read_tasks")
  async get(@Param("artifactId") artifactId: string) {
    const result = await this.getArtifactUseCase.execute(artifactId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toArtifactResponse(result.value);
  }

  @Patch(":artifactId")
  @RequirePermission("create_task")
  async updateMetadata(
    @Param("artifactId") artifactId: string,
    @Body() dto: UpdateArtifactMetadataDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.updateArtifactMetadataUseCase.execute({
      artifactId,
      ...dto,
      updatedBy: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toArtifactResponse(result.value);
  }

  @Post(":artifactId/versions")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async addVersion(
    @Param("artifactId") artifactId: string,
    @Body() dto: AddArtifactVersionDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.addArtifactVersionUseCase.execute({
      artifactId,
      ...dto,
      updatedBy: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toArtifactResponse(result.value);
  }

  @Post(":artifactId/link")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async link(
    @Param("artifactId") artifactId: string,
    @Body() dto: LinkArtifactDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.linkArtifactUseCase.execute({
      artifactId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      updatedBy: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toArtifactResponse(result.value);
  }

  @Post(":artifactId/unlink")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async unlink(
    @Param("artifactId") artifactId: string,
    @Body() dto: UnlinkArtifactDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.unlinkArtifactUseCase.execute({
      artifactId,
      targetType: dto.targetType,
      updatedBy: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toArtifactResponse(result.value);
  }

  @Post(":artifactId/archive")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async archive(
    @Param("artifactId") artifactId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.archiveArtifactUseCase.execute({
      artifactId,
      updatedBy: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toArtifactResponse(result.value);
  }

  @Delete(":artifactId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("manage_workspace_rules")
  async delete(@Param("artifactId") artifactId: string) {
    const result = await this.deleteArtifactUseCase.execute(artifactId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
  }
}
