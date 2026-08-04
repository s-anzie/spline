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
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../domain/ports/workspace.repository.port";
import { WorkspaceStatus } from "../domain/workspace";
import { WorkspaceNotFoundError } from "../domain/workspace.errors";

export interface ChangeWorkspaceStatusInput {
  workspaceId: string;
  status: WorkspaceStatus;
}

export type ChangeWorkspaceStatusError =
  | WorkspaceNotFoundError
  | InvalidStateTransitionError;

@Injectable()
export class ChangeWorkspaceStatusUseCase
  implements
    UseCase<ChangeWorkspaceStatusInput, Result<void, ChangeWorkspaceStatusError>>
{
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ChangeWorkspaceStatusInput,
  ): Promise<Result<void, ChangeWorkspaceStatusError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }

    const changed = workspace.changeStatus(input.status, this.clock.now());
    if (changed.isFailure) {
      return Result.fail(changed.error);
    }

    await this.workspaces.save(workspace);
    flushDomainEvents(workspace, this.publisher);
    return Result.ok(undefined);
  }
}
