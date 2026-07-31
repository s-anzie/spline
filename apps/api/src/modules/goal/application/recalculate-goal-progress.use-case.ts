import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";
import { Goal } from "../domain/goal";
import { GoalNotFoundError } from "./goal-application.errors";

export interface RecalculateGoalProgressInput {
  goalId: string;
  completedTaskCount: number;
  totalTaskCount: number;
}

/**
 * Called by the Task module whenever a task belonging to a goal changes
 * completion state — Goal has no idea Task exists, it just receives counts.
 */
@Injectable()
export class RecalculateGoalProgressUseCase {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: RecalculateGoalProgressInput): Promise<Result<Goal, GoalNotFoundError>> {
    const goal = await this.goals.findById(UniqueEntityId.create(input.goalId));
    if (!goal) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }

    goal.recalculateProgress(input.completedTaskCount, input.totalTaskCount);

    await this.goals.save(goal);
    this.eventPublisher.publishAll(goal.domainEvents);
    goal.clearEvents();

    return Result.ok(goal);
  }
}
