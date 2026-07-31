import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ArtifactDeleted } from "../domain/artifact-events";
import { ARTIFACT_REPOSITORY, ArtifactRepository } from "../domain/ports/artifact.repository.port";
import { ArtifactNotFoundError } from "./artifact-application.errors";

@Injectable()
export class DeleteArtifactUseCase {
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(artifactId: string): Promise<Result<void, ArtifactNotFoundError>> {
    const id = UniqueEntityId.create(artifactId);
    const artifact = await this.artifacts.findById(id);
    if (!artifact) {
      return Result.fail(new ArtifactNotFoundError(artifactId));
    }

    await this.artifacts.delete(id);
    this.eventPublisher.publish(new ArtifactDeleted(artifact.workspaceId, artifactId));

    return Result.ok(undefined);
  }
}
