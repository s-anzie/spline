import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Artifact, ArtifactStatus } from "../domain/artifact";
import {
  ARTIFACT_REPOSITORY,
  ArtifactRepository,
} from "../domain/ports/artifact.repository.port";

export interface ListArtifactsInput {
  workspaceId: string;
  type?: string;
  goalId?: string;
  taskId?: string;
  repositoryId?: string;
  tags?: readonly string[];
  statuses?: readonly ArtifactStatus[];
  createdByType?: ActorType;
  createdById?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

/** Deleted artifacts stay for audit but are out of sight unless asked for. */
const VISIBLE_BY_DEFAULT: readonly ArtifactStatus[] = ["ACTIVE", "ARCHIVED"];

@Injectable()
export class ListArtifactsUseCase
  implements UseCase<ListArtifactsInput, Result<Artifact[], never>>
{
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
  ) {}

  async execute(input: ListArtifactsInput): Promise<Result<Artifact[], never>> {
    const createdBy =
      input.createdByType && input.createdById
        ? ActorRef.create(input.createdByType, input.createdById)
        : null;

    const artifacts = await this.artifacts.list({
      workspaceId: input.workspaceId,
      ...(input.type !== undefined && { type: input.type }),
      ...(input.goalId !== undefined && { goalId: input.goalId }),
      ...(input.taskId !== undefined && { taskId: input.taskId }),
      ...(input.repositoryId !== undefined && { repositoryId: input.repositoryId }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.createdAfter !== undefined && { createdAfter: input.createdAfter }),
      ...(input.createdBefore !== undefined && { createdBefore: input.createdBefore }),
      ...(createdBy?.isSuccess && { createdBy: createdBy.value }),
      statuses: input.statuses ?? VISIBLE_BY_DEFAULT,
    });
    return Result.ok(
      [...artifacts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }
}
