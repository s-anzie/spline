import { Priority } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { wouldCreateCycle } from "../../../kernel/domain/dependency-graph";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";
import { Goal } from "../domain/goal";
import { EmptyGoalTitleError, SelfGoalDependencyError } from "../domain/goal.errors";
import {
  CircularGoalDependencyError,
  DependencyGoalNotFoundError,
  GoalNotFoundError,
} from "./goal-application.errors";

export interface UpdateGoalDetailsInput {
  goalId: string;
  title?: string;
  description?: string;
  priority?: Priority;
  successCriteria?: unknown[];
  startDate?: Date;
  dueDate?: Date;
  dependencies?: string[];
}

export type UpdateGoalDetailsError =
  | GoalNotFoundError
  | EmptyGoalTitleError
  | SelfGoalDependencyError
  | DependencyGoalNotFoundError
  | CircularGoalDependencyError;

@Injectable()
export class UpdateGoalDetailsUseCase {
  constructor(@Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository) {}

  async execute(input: UpdateGoalDetailsInput): Promise<Result<Goal, UpdateGoalDetailsError>> {
    const goal = await this.goals.findById(UniqueEntityId.create(input.goalId));
    if (!goal) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }

    if (input.dependencies && input.dependencies.length > 0) {
      if (input.dependencies.includes(goal.id.toString())) {
        return Result.fail(new SelfGoalDependencyError(goal.id.toString()));
      }

      const dependencyGoals = await this.goals.findByIds(input.dependencies);
      const goalsById = new Map(dependencyGoals.map((g) => [g.id.toString(), g]));
      const missingOrForeign = input.dependencies.filter((id) => {
        const found = goalsById.get(id);
        return !found || found.workspaceId !== goal.workspaceId;
      });
      if (missingOrForeign.length > 0) {
        return Result.fail(new DependencyGoalNotFoundError(missingOrForeign));
      }

      if (wouldCreateCycle(goal.id.toString(), input.dependencies, goalsById)) {
        return Result.fail(new CircularGoalDependencyError(goal.id.toString()));
      }
    }

    try {
      goal.updateDetails(input);
    } catch (error) {
      if (error instanceof EmptyGoalTitleError || error instanceof SelfGoalDependencyError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.goals.save(goal);
    return Result.ok(goal);
  }
}
