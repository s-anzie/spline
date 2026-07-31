import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Actor, Artifact } from "../domain/artifact";
import { ARTIFACT_REPOSITORY, ArtifactRepository } from "../domain/ports/artifact.repository.port";
import { ArtifactArchivedError } from "../domain/artifact.errors";
import { ArtifactNotFoundError } from "./artifact-application.errors";

export interface AddArtifactVersionInput {
  artifactId: string;
  contentRef?: string;
  checksum?: string;
  updatedBy: Actor;
}

export type AddArtifactVersionError = ArtifactNotFoundError | ArtifactArchivedError;

@Injectable()
export class AddArtifactVersionUseCase {
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: AddArtifactVersionInput): Promise<Result<Artifact, AddArtifactVersionError>> {
    const artifact = await this.artifacts.findById(UniqueEntityId.create(input.artifactId));
    if (!artifact) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }

    try {
      artifact.addVersion({ contentRef: input.contentRef, checksum: input.checksum }, input.updatedBy);
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
