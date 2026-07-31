import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";
import { Goal } from "../domain/goal";
import { GoalValidationNotPendingError } from "../domain/goal.errors";
import { GoalNotFoundError } from "./goal-application.errors";

export type ValidateGoalError = GoalNotFoundError | GoalValidationNotPendingError;

@Injectable()
export class ValidateGoalUseCase {
  constructor(@Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository) {}

  async execute(goalId: string): Promise<Result<Goal, ValidateGoalError>> {
    const goal = await this.goals.findById(UniqueEntityId.create(goalId));
    if (!goal) {
      return Result.fail(new GoalNotFoundError(goalId));
    }

    try {
      goal.validate();
    } catch (error) {
      if (error instanceof GoalValidationNotPendingError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.goals.save(goal);
    return Result.ok(goal);
  }
}
