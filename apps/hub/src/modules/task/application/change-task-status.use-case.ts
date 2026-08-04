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
import { TaskStatus } from "../domain/task";
import {
  CompletionRequiresValidationError,
  TaskNotFoundError,
  UnsatisfiedTaskDependenciesError,
} from "../domain/task.errors";
import { GoalProgressSyncService } from "./goal-progress-sync.service";

export interface ChangeTaskStatusInput {
  taskId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
  status: TaskStatus;
}

export type ChangeTaskStatusError =
  | TaskNotFoundError
  | InvalidStateTransitionError
  | CompletionRequiresValidationError
  | UnsatisfiedTaskDependenciesError;

@Injectable()
export class ChangeTaskStatusUseCase
  implements UseCase<ChangeTaskStatusInput, Result<void, ChangeTaskStatusError>>
{
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    private readonly goalSync: GoalProgressSyncService,
  ) {}

  async execute(
    input: ChangeTaskStatusInput,
  ): Promise<Result<void, ChangeTaskStatusError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || task.workspaceId !== input.workspaceId) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    // §9.5: a task becomes workable only once its dependencies are satisfied.
    // CANCELLED ones never will be, so they do not hold it back.
    if (input.status === "READY" && task.dependsOnTaskIds.length > 0) {
      const pending: string[] = [];
      for (const dependencyId of task.dependsOnTaskIds) {
        const dependency = await this.tasks.findById(dependencyId);
        if (
          dependency &&
          dependency.status !== "COMPLETED" &&
          dependency.status !== "CANCELLED"
        ) {
          pending.push(dependencyId);
        }
      }
      if (pending.length > 0) {
        return Result.fail(new UnsatisfiedTaskDependenciesError(pending));
      }
    }

    const changed = task.changeStatus(input.status, this.clock.now());
    if (changed.isFailure) {
      return Result.fail(changed.error);
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
    await this.goalSync.sync(task.workspaceId, task.goalId);
    return Result.ok(undefined);
  }
}
