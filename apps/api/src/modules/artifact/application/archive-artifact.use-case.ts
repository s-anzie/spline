import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Actor, Artifact } from "../domain/artifact";
import { ArtifactArchivedError } from "../domain/artifact.errors";
import { ARTIFACT_REPOSITORY, ArtifactRepository } from "../domain/ports/artifact.repository.port";
import { ArtifactNotFoundError } from "./artifact-application.errors";

export interface ArchiveArtifactInput {
  artifactId: string;
  updatedBy: Actor;
}

export type ArchiveArtifactError = ArtifactNotFoundError | ArtifactArchivedError;

@Injectable()
export class ArchiveArtifactUseCase {
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: ArchiveArtifactInput): Promise<Result<Artifact, ArchiveArtifactError>> {
    const artifact = await this.artifacts.findById(UniqueEntityId.create(input.artifactId));
    if (!artifact) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }

    try {
      artifact.archive(input.updatedBy);
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
