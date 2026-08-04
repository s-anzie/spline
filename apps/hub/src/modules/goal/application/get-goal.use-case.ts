import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { Goal } from "../domain/goal";
import { GoalNotFoundError } from "../domain/goal.errors";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";

export interface GetGoalInput {
  goalId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
}

@Injectable()
export class GetGoalUseCase
  implements UseCase<GetGoalInput, Result<Goal, GoalNotFoundError>>
{
  constructor(@Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository) {}

  async execute(input: GetGoalInput): Promise<Result<Goal, GoalNotFoundError>> {
    const goal = await this.goals.findById(input.goalId);
    if (!goal || (input.workspaceId && goal.workspaceId !== input.workspaceId)) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }
    return Result.ok(goal);
  }
}
