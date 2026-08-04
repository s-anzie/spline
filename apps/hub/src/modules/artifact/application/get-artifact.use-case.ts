import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { Artifact } from "../domain/artifact";
import { ArtifactNotFoundError } from "../domain/artifact.errors";
import {
  ARTIFACT_REPOSITORY,
  ArtifactRepository,
} from "../domain/ports/artifact.repository.port";

export interface GetArtifactInput {
  artifactId: string;
  workspaceId?: string;
}

@Injectable()
export class GetArtifactUseCase
  implements UseCase<GetArtifactInput, Result<Artifact, ArtifactNotFoundError>>
{
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
  ) {}

  async execute(
    input: GetArtifactInput,
  ): Promise<Result<Artifact, ArtifactNotFoundError>> {
    const artifact = await this.artifacts.findById(input.artifactId);
    if (!artifact || (input.workspaceId && artifact.workspaceId !== input.workspaceId)) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }
    return Result.ok(artifact);
  }
}
