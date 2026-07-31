import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Actor, Artifact, ArtifactLinkTargetType } from "../domain/artifact";
import { ArtifactArchivedError } from "../domain/artifact.errors";
import { ARTIFACT_REPOSITORY, ArtifactRepository } from "../domain/ports/artifact.repository.port";
import { ArtifactNotFoundError } from "./artifact-application.errors";

export interface UnlinkArtifactInput {
  artifactId: string;
  targetType: ArtifactLinkTargetType;
  updatedBy: Actor;
}

export type UnlinkArtifactError = ArtifactNotFoundError | ArtifactArchivedError;

@Injectable()
export class UnlinkArtifactUseCase {
  constructor(@Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository) {}

  async execute(input: UnlinkArtifactInput): Promise<Result<Artifact, UnlinkArtifactError>> {
    const artifact = await this.artifacts.findById(UniqueEntityId.create(input.artifactId));
    if (!artifact) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }

    try {
      artifact.unlinkFrom(input.targetType, input.updatedBy);
    } catch (error) {
      if (error instanceof ArtifactArchivedError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.artifacts.save(artifact);

    return Result.ok(artifact);
  }
}
