import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import {
  ArtifactNotActiveError,
  ArtifactNotFoundError,
  ImmutableArtifactError,
} from "../domain/artifact.errors";
import {
  ARTIFACT_REPOSITORY,
  ArtifactRepository,
} from "../domain/ports/artifact.repository.port";

export interface UpdateArtifactMetadataInput {
  artifactId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
  name?: string;
  description?: string;
  tags?: readonly string[];
  metadata?: Record<string, unknown>;
}

export type UpdateArtifactMetadataError =
  | ArtifactNotFoundError
  | GuardViolation
  | ImmutableArtifactError
  | ArtifactNotActiveError;

@Injectable()
export class UpdateArtifactMetadataUseCase
  implements
    UseCase<UpdateArtifactMetadataInput, Result<void, UpdateArtifactMetadataError>>
{
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: UpdateArtifactMetadataInput,
  ): Promise<Result<void, UpdateArtifactMetadataError>> {
    const artifact = await this.artifacts.findById(input.artifactId);
    if (!artifact || (input.workspaceId && artifact.workspaceId !== input.workspaceId)) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }

    const updated = artifact.updateMetadata(
      {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.tags !== undefined && { tags: input.tags }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
      },
      this.clock.now(),
    );
    if (updated.isFailure) {
      return Result.fail(updated.error);
    }

    await this.artifacts.save(artifact);
    flushDomainEvents(artifact, this.publisher);
    return Result.ok(undefined);
  }
}
