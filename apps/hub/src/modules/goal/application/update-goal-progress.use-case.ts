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
import { GoalNotFoundError } from "../domain/goal.errors";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";

export interface UpdateGoalProgressInput {
  goalId: string;
  progress: number;
}

/**
 * Progress is stored, not derived at read time: the task module will feed it
 * through domain events, keeping goal listings fast and the coupling one-way.
 */
@Injectable()
export class UpdateGoalProgressUseCase
  implements
    UseCase<UpdateGoalProgressInput, Result<void, GoalNotFoundError | GuardViolation>>
{
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: UpdateGoalProgressInput,
  ): Promise<Result<void, GoalNotFoundError | GuardViolation>> {
    const goal = await this.goals.findById(input.goalId);
    if (!goal) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }

    const updated = goal.updateProgress(input.progress, this.clock.now());
    if (updated.isFailure) {
      return Result.fail(updated.error);
    }

    await this.goals.save(goal);
    flushDomainEvents(goal, this.publisher);
    return Result.ok(undefined);
  }
}
