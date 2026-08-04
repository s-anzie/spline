import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import {
  ArtifactLinkError,
  ArtifactNotActiveError,
  ArtifactNotFoundError,
} from "../domain/artifact.errors";
import { ArtifactLinkTargets } from "./artifact-link-targets.service";
import {
  ARTIFACT_REPOSITORY,
  ArtifactRepository,
} from "../domain/ports/artifact.repository.port";

export interface LinkArtifactInput {
  artifactId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
  operation: "link" | "unlink";
  goalId?: string;
  taskId?: string;
  repositoryId?: string;
  decisionId?: string;
  goal?: boolean;
  task?: boolean;
  repository?: boolean;
  decision?: boolean;
}

export type LinkArtifactError =
  | ArtifactNotFoundError
  | ArtifactNotActiveError
  | ArtifactLinkError;

/** §15.3 — the "Linked" step of the lifecycle, in both directions. */
@Injectable()
export class LinkArtifactUseCase
  implements UseCase<LinkArtifactInput, Result<void, LinkArtifactError>>
{
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    private readonly linkTargets: ArtifactLinkTargets,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: LinkArtifactInput): Promise<Result<void, LinkArtifactError>> {
    const artifact = await this.artifacts.findById(input.artifactId);
    if (!artifact || (input.workspaceId && artifact.workspaceId !== input.workspaceId)) {
      return Result.fail(new ArtifactNotFoundError(input.artifactId));
    }

    if (input.operation === "link") {
      // Removing a reference can never dangle, so only linking is verified.
      const links = await this.linkTargets.verify(artifact.workspaceId, {
        ...(input.goalId !== undefined && { goalId: input.goalId }),
        ...(input.taskId !== undefined && { taskId: input.taskId }),
        ...(input.decisionId !== undefined && { decisionId: input.decisionId }),
      });
      if (links.isFailure) {
        return Result.fail(links.error);
      }
    }

    const changed =
      input.operation === "link"
        ? artifact.link(
            {
              ...(input.goalId !== undefined && { goalId: input.goalId }),
              ...(input.taskId !== undefined && { taskId: input.taskId }),
              ...(input.repositoryId !== undefined && { repositoryId: input.repositoryId }),
              ...(input.decisionId !== undefined && { decisionId: input.decisionId }),
            },
            this.clock.now(),
          )
        : artifact.unlink(
            {
              ...(input.goal !== undefined && { goal: input.goal }),
              ...(input.task !== undefined && { task: input.task }),
              ...(input.repository !== undefined && { repository: input.repository }),
              ...(input.decision !== undefined && { decision: input.decision }),
            },
            this.clock.now(),
          );
    if (changed.isFailure) {
      return Result.fail(changed.error);
    }

    await this.artifacts.save(artifact);
    await flushDomainEvents(artifact, this.publisher);
    return Result.ok(undefined);
  }
}
