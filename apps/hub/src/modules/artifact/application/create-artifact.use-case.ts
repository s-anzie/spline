import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import {
  WorkspaceNotActiveError,
  WorkspaceNotFoundError,
} from "../../workspace/domain/workspace.errors";
import { Artifact, CreateArtifactError } from "../domain/artifact";
import { ArtifactLinkError } from "../domain/artifact.errors";
import { ArtifactLinkTargets } from "./artifact-link-targets.service";
import {
  ARTIFACT_REPOSITORY,
  ArtifactRepository,
} from "../domain/ports/artifact.repository.port";

export interface CreateArtifactInput {
  workspaceId: string;
  type: string;
  name: string;
  description?: string;
  checksum: string;
  storageRef: string;
  sizeBytes?: number;
  note?: string;
  goalId?: string;
  taskId?: string;
  repositoryId?: string;
  decisionId?: string;
  tags?: readonly string[];
  metadata?: Record<string, unknown>;
  immutable?: boolean;
  createdByType: ActorType;
  createdById: string;
}

export interface CreateArtifactOutput {
  artifactId: string;
  version: number;
}

export type CreateArtifactUseCaseError =
  | CreateArtifactError
  | WorkspaceNotFoundError
  | WorkspaceNotActiveError
  | ArtifactLinkError;

@Injectable()
export class CreateArtifactUseCase
  implements
    UseCase<CreateArtifactInput, Result<CreateArtifactOutput, CreateArtifactUseCaseError>>
{
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    private readonly linkTargets: ArtifactLinkTargets,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: CreateArtifactInput,
  ): Promise<Result<CreateArtifactOutput, CreateArtifactUseCaseError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace || workspace.status === "DELETED") {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }
    if (workspace.status !== "ACTIVE") {
      return Result.fail(new WorkspaceNotActiveError(workspace.status));
    }

    const links = await this.linkTargets.verify(input.workspaceId, {
      ...(input.goalId !== undefined && { goalId: input.goalId }),
      ...(input.taskId !== undefined && { taskId: input.taskId }),
      ...(input.decisionId !== undefined && { decisionId: input.decisionId }),
    });
    if (links.isFailure) {
      return Result.fail(links.error);
    }

    const createdBy = ActorRef.create(input.createdByType, input.createdById);
    if (createdBy.isFailure) {
      return Result.fail(createdBy.error);
    }

    const artifact = Artifact.create({
      workspaceId: input.workspaceId,
      type: input.type,
      name: input.name,
      ...(input.description !== undefined && { description: input.description }),
      firstVersion: {
        checksum: input.checksum,
        storageRef: input.storageRef,
        ...(input.sizeBytes !== undefined && { sizeBytes: input.sizeBytes }),
        ...(input.note !== undefined && { note: input.note }),
      },
      ...(input.goalId !== undefined && { goalId: input.goalId }),
      ...(input.taskId !== undefined && { taskId: input.taskId }),
      ...(input.repositoryId !== undefined && { repositoryId: input.repositoryId }),
      ...(input.decisionId !== undefined && { decisionId: input.decisionId }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
      ...(input.immutable !== undefined && { immutable: input.immutable }),
      createdBy: createdBy.value,
      now: this.clock.now(),
    });
    if (artifact.isFailure) {
      return Result.fail(artifact.error);
    }

    await this.artifacts.save(artifact.value);
    await flushDomainEvents(artifact.value, this.publisher);
    return Result.ok({ artifactId: artifact.value.id.value, version: 1 });
  }
}
