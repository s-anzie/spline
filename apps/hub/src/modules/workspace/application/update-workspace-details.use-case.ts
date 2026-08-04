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
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../domain/ports/workspace.repository.port";
import {
  UpdateWorkspaceDetailsError,
  WorkspaceSettings,
} from "../domain/workspace";
import { WorkspaceNotFoundError } from "../domain/workspace.errors";

export interface UpdateWorkspaceDetailsInput {
  workspaceId: string;
  name?: string;
  description?: string;
  settings?: WorkspaceSettings;
}

export type UpdateWorkspaceDetailsUseCaseError =
  | WorkspaceNotFoundError
  | UpdateWorkspaceDetailsError;

@Injectable()
export class UpdateWorkspaceDetailsUseCase
  implements
    UseCase<UpdateWorkspaceDetailsInput, Result<void, UpdateWorkspaceDetailsUseCaseError>>
{
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: UpdateWorkspaceDetailsInput,
  ): Promise<Result<void, UpdateWorkspaceDetailsUseCaseError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace || workspace.status === "DELETED") {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }

    const updated = workspace.updateDetails(
      {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.settings !== undefined && { settings: input.settings }),
      },
      this.clock.now(),
    );
    if (updated.isFailure) {
      return Result.fail(updated.error);
    }

    await this.workspaces.save(workspace);
    flushDomainEvents(workspace, this.publisher);
    return Result.ok(undefined);
  }
}
