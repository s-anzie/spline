import { Inject, Injectable } from "@nestjs/common";

import { Artifact } from "../domain/artifact";
import {
  ARTIFACT_REPOSITORY,
  ArtifactListFilter,
  ArtifactRepository,
} from "../domain/ports/artifact.repository.port";

@Injectable()
export class ListArtifactsUseCase {
  constructor(@Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository) {}

  async execute(filter: ArtifactListFilter): Promise<Artifact[]> {
    return this.artifacts.list(filter);
  }
}
