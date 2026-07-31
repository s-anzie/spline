import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Actor, Artifact } from "../domain/artifact";
import { ARTIFACT_REPOSITORY, ArtifactRepository } from "../domain/ports/artifact.repository.port";
import { ArtifactArchivedError, EmptyArtifactNameError } from "../domain/artifact.errors";
import { ArtifactNotFoundError } from "./artifact-application.errors";

export interface UpdateArtifactMetadataInput {
  artifactId: string;
  name?: string;
  description?: string;
  source?: string;
  updatedBy: Actor;
}

export type UpdateArtifactMetadataError =
  | ArtifactNotFoundError
  | ArtifactArchivedError
  | EmptyArtifactNameError;

@Injectable()
export class UpdateArtifactMetadataUseCase {
  constructor(@Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository) {}

  async execute(input: UpdateArtifactMetadataInput): Promise<Result<Artifact, UpdateArtifactMetadataError>> {
    const artifact = await this.artifacts.findById(UniqueEntityId.create(input.artifactId));
    if (!artifact) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }

    try {
      artifact.updateMetadata(
        { name: input.name, description: input.description, source: input.source },
        input.updatedBy,
      );
    } catch (error) {
      if (error instanceof ArtifactArchivedError || error instanceof EmptyArtifactNameError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.artifacts.save(artifact);

    return Result.ok(artifact);
  }
}
