import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";
import { Goal } from "../domain/goal";
import { GoalNotFoundError } from "./goal-application.errors";

@Injectable()
export class GetGoalUseCase {
  constructor(@Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository) {}

  async execute(goalId: string): Promise<Result<Goal, GoalNotFoundError>> {
    const goal = await this.goals.findById(UniqueEntityId.create(goalId));
    if (!goal) {
      return Result.fail(new GoalNotFoundError(goalId));
    }
    return Result.ok(goal);
  }
}
