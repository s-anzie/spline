import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ArtifactStatus } from "../domain/artifact";
import { ArtifactNotFoundError } from "../domain/artifact.errors";
import {
  ARTIFACT_REPOSITORY,
  ArtifactRepository,
} from "../domain/ports/artifact.repository.port";

export interface ChangeArtifactStatusInput {
  artifactId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
  status: ArtifactStatus;
}

export type ChangeArtifactStatusError =
  | ArtifactNotFoundError
  | InvalidStateTransitionError;

@Injectable()
export class ChangeArtifactStatusUseCase
  implements UseCase<ChangeArtifactStatusInput, Result<void, ChangeArtifactStatusError>>
{
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ChangeArtifactStatusInput,
  ): Promise<Result<void, ChangeArtifactStatusError>> {
    const artifact = await this.artifacts.findById(input.artifactId);
    if (!artifact || (input.workspaceId && artifact.workspaceId !== input.workspaceId)) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }

    const changed = artifact.changeStatus(input.status, this.clock.now());
    if (changed.isFailure) {
      return Result.fail(changed.error);
    }

    await this.artifacts.save(artifact);
    await flushDomainEvents(artifact, this.publisher);
    return Result.ok(undefined);
  }
}
