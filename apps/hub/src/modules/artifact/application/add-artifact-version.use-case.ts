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
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  ArtifactNotActiveError,
  ArtifactNotFoundError,
  ImmutableArtifactError,
} from "../domain/artifact.errors";
import {
  ARTIFACT_REPOSITORY,
  ArtifactRepository,
} from "../domain/ports/artifact.repository.port";

export interface AddArtifactVersionInput {
  artifactId: string;
  workspaceId?: string;
  checksum: string;
  storageRef: string;
  sizeBytes?: number;
  note?: string;
  createdByType: ActorType;
  createdById: string;
}

export type AddArtifactVersionError =
  | ArtifactNotFoundError
  | GuardViolation
  | ImmutableArtifactError
  | ArtifactNotActiveError;

@Injectable()
export class AddArtifactVersionUseCase
  implements
    UseCase<AddArtifactVersionInput, Result<{ version: number }, AddArtifactVersionError>>
{
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: AddArtifactVersionInput,
  ): Promise<Result<{ version: number }, AddArtifactVersionError>> {
    const artifact = await this.artifacts.findById(input.artifactId);
    if (!artifact || (input.workspaceId && artifact.workspaceId !== input.workspaceId)) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }
    const createdBy = ActorRef.create(input.createdByType, input.createdById);
    if (createdBy.isFailure) {
      return Result.fail(createdBy.error);
    }

    const added = artifact.addVersion(
      {
        checksum: input.checksum,
        storageRef: input.storageRef,
        ...(input.sizeBytes !== undefined && { sizeBytes: input.sizeBytes }),
        ...(input.note !== undefined && { note: input.note }),
      },
      createdBy.value,
      this.clock.now(),
    );
    if (added.isFailure) {
      return Result.fail(added.error);
    }

    await this.artifacts.save(artifact);
    flushDomainEvents(artifact, this.publisher);
    return Result.ok({ version: added.value });
  }
}
