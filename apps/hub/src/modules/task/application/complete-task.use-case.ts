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
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { TaskNotFoundError } from "../domain/task.errors";
import { GoalProgressSyncService } from "./goal-progress-sync.service";

export interface CompleteTaskInput {
  taskId: string;
  workspaceId?: string;
}

export type CompleteTaskError = TaskNotFoundError | InvalidStateTransitionError;

/**
 * The single path to COMPLETED (§4.24). Guarded at the route by
 * approve_validation — an agent submits, a human approves.
 */
@Injectable()
export class CompleteTaskUseCase
  implements UseCase<CompleteTaskInput, Result<void, CompleteTaskError>>
{
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    private readonly goalSync: GoalProgressSyncService,
  ) {}

  async execute(input: CompleteTaskInput): Promise<Result<void, CompleteTaskError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || (input.workspaceId && task.workspaceId !== input.workspaceId)) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    const completed = task.complete(this.clock.now());
    if (completed.isFailure) {
      return Result.fail(completed.error);
    }

    await this.tasks.save(task);
    flushDomainEvents(task, this.publisher);
    await this.goalSync.sync(task.goalId);
    return Result.ok(undefined);
  }
}
