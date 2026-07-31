import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GetGoalUseCase } from "../../goal/application/get-goal.use-case";
import { GetTaskUseCase } from "../../task/application/get-task.use-case";
import { Actor, Artifact, ArtifactLinkTargetType } from "../domain/artifact";
import { ArtifactArchivedError } from "../domain/artifact.errors";
import { ARTIFACT_REPOSITORY, ArtifactRepository } from "../domain/ports/artifact.repository.port";
import {
  ArtifactNotFoundError,
  LinkedGoalNotInWorkspaceError,
  LinkedTaskNotInWorkspaceError,
} from "./artifact-application.errors";

export interface LinkArtifactInput {
  artifactId: string;
  targetType: ArtifactLinkTargetType;
  targetId: string;
  updatedBy: Actor;
}

export type LinkArtifactError =
  | ArtifactNotFoundError
  | ArtifactArchivedError
  | LinkedGoalNotInWorkspaceError
  | LinkedTaskNotInWorkspaceError;

@Injectable()
export class LinkArtifactUseCase {
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    private readonly getGoal: GetGoalUseCase,
    private readonly getTask: GetTaskUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: LinkArtifactInput): Promise<Result<Artifact, LinkArtifactError>> {
    const artifact = await this.artifacts.findById(UniqueEntityId.create(input.artifactId));
    if (!artifact) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }

    if (input.targetType === "goal") {
      const goalResult = await this.getGoal.execute(input.targetId);
      if (goalResult.isFailure || goalResult.value.workspaceId !== artifact.workspaceId) {
        return Result.fail(new LinkedGoalNotInWorkspaceError(input.targetId, artifact.workspaceId));
      }
    }

    if (input.targetType === "task") {
      const taskResult = await this.getTask.execute(input.targetId);
      if (taskResult.isFailure || taskResult.value.workspaceId !== artifact.workspaceId) {
        return Result.fail(new LinkedTaskNotInWorkspaceError(input.targetId, artifact.workspaceId));
      }
    }

    try {
      artifact.linkTo(input.targetType, input.targetId, input.updatedBy);
    } catch (error) {
      if (error instanceof ArtifactArchivedError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.artifacts.save(artifact);
    this.eventPublisher.publishAll(artifact.domainEvents);
    artifact.clearEvents();

    return Result.ok(artifact);
  }
}
