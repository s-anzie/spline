import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import {
  BlockerAlreadyResolvedError,
  BlockerNotFoundError,
  TaskNotFoundError,
} from "../domain/task.errors";

export interface ResolveBlockerInput {
  taskId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
  blockerId: string;
  resolution: string;
}

export type ResolveBlockerError =
  | TaskNotFoundError
  | BlockerNotFoundError
  | BlockerAlreadyResolvedError;

@Injectable()
export class ResolveBlockerUseCase
  implements UseCase<ResolveBlockerInput, Result<void, ResolveBlockerError>>
{
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: ResolveBlockerInput): Promise<Result<void, ResolveBlockerError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || (input.workspaceId && task.workspaceId !== input.workspaceId)) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    const resolved = task.resolveBlocker(
      input.blockerId,
      input.resolution,
      this.clock.now(),
    );
    if (resolved.isFailure) {
      return Result.fail(resolved.error);
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
    return Result.ok(undefined);
  }
}
