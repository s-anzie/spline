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
import { TASK_PROOF, TaskProofPort } from "../domain/ports/task-proof.port";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { MissingProofError, TaskNotFoundError } from "../domain/task.errors";
import { GoalProgressSyncService } from "./goal-progress-sync.service";

export interface CompleteTaskInput {
  taskId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
}

export type CompleteTaskError =
  | TaskNotFoundError
  | InvalidStateTransitionError
  | MissingProofError;

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
    @Inject(TASK_PROOF) private readonly proof: TaskProofPort,
  ) {}

  async execute(input: CompleteTaskInput): Promise<Result<void, CompleteTaskError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || task.workspaceId !== input.workspaceId) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    // §11.7 — the state machine only guaranteed the task went *through* a
    // step named validation. It never guaranteed a proof existed, so
    // CompletionRequiresValidationError was protecting a word.
    const missing = await this.proof.unsatisfiedMandatory(task.id.value);
    if (missing.length > 0) {
      return Result.fail(new MissingProofError(missing));
    }

    const completed = task.complete(this.clock.now());
    if (completed.isFailure) {
      return Result.fail(completed.error);
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
    await this.goalSync.sync(task.workspaceId, task.goalId);
    return Result.ok(undefined);
  }
}
