import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Artifact } from "../domain/artifact";
import { ARTIFACT_REPOSITORY, ArtifactRepository } from "../domain/ports/artifact.repository.port";
import { ArtifactNotFoundError } from "./artifact-application.errors";

@Injectable()
export class GetArtifactUseCase {
  constructor(@Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository) {}

  async execute(artifactId: string): Promise<Result<Artifact, ArtifactNotFoundError>> {
    const artifact = await this.artifacts.findById(UniqueEntityId.create(artifactId));
    if (!artifact) {
      return Result.fail(new ArtifactNotFoundError(artifactId));
    }
    return Result.ok(artifact);
  }
}
