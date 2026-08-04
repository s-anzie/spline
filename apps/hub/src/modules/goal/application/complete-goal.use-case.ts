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
  GoalNotFoundError,
  OpenChildrenError,
  OpenTasksError,
} from "../domain/goal.errors";
import { GOAL_WORKLOAD, GoalWorkloadPort } from "../domain/ports/goal-workload.port";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";

export interface CompleteGoalInput {
  goalId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
}

export type CompleteGoalError =
  | GoalNotFoundError
  | OpenChildrenError
  | OpenTasksError
  | InvalidStateTransitionError;

/**
 * The single path to COMPLETED (§4.5). Guarded at the route by
 * `approve_validation` — an agent brings a goal to REVIEW, a human approves.
 */
@Injectable()
export class CompleteGoalUseCase
  implements UseCase<CompleteGoalInput, Result<void, CompleteGoalError>>
{
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(GOAL_WORKLOAD) private readonly workload: GoalWorkloadPort,
  ) {}

  async execute(input: CompleteGoalInput): Promise<Result<void, CompleteGoalError>> {
    const goal = await this.goals.findById(input.goalId);
    if (!goal || (input.workspaceId && goal.workspaceId !== input.workspaceId)) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }
    if (await this.goals.hasOpenChildren(goal.id.value)) {
      return Result.fail(new OpenChildrenError());
    }
    // An objective whose work is still running is not an achieved result.
    if (await this.workload.hasOpenTasks(goal.id.value)) {
      return Result.fail(new OpenTasksError());
    }

    const completed = goal.complete(this.clock.now());
    if (completed.isFailure) {
      return Result.fail(completed.error);
    }

    await this.goals.save(goal);
    await flushDomainEvents(goal, this.publisher);
    return Result.ok(undefined);
  }
}
