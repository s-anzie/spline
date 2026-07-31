import { GoalStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";
import { Goal } from "../domain/goal";
import { InvalidGoalStatusTransitionError } from "../domain/goal.errors";
import { GoalNotFoundError } from "./goal-application.errors";

export interface ChangeGoalStatusInput {
  goalId: string;
  status: GoalStatus;
}

export type ChangeGoalStatusError = GoalNotFoundError | InvalidGoalStatusTransitionError;

@Injectable()
export class ChangeGoalStatusUseCase {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: ChangeGoalStatusInput): Promise<Result<Goal, ChangeGoalStatusError>> {
    const goal = await this.goals.findById(UniqueEntityId.create(input.goalId));
    if (!goal) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }

    try {
      goal.changeStatus(input.status);
    } catch (error) {
      if (error instanceof InvalidGoalStatusTransitionError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.goals.save(goal);
    this.eventPublisher.publishAll(goal.domainEvents);
    goal.clearEvents();

    return Result.ok(goal);
  }
}
