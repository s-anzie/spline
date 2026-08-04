import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { GOAL_WORKLOAD, GoalWorkloadPort } from "../domain/ports/goal-workload.port";
import { UpdateGoalProgressUseCase } from "./update-goal-progress.use-case";

export interface RecomputeGoalProgressInput {
  /** Carried through from the work item: the recompute writes to a goal. */
  workspaceId: string;
  goalId: string;
}

/**
 * §5.6 assigns "calcul du pourcentage" to the Goal Engine, so the formula
 * lives here even though the facts come from work items through the port.
 */
@Injectable()
export class RecomputeGoalProgressUseCase
  implements UseCase<RecomputeGoalProgressInput, Result<void, never>>
{
  constructor(
    @Inject(GOAL_WORKLOAD) private readonly workload: GoalWorkloadPort,
    private readonly updateProgress: UpdateGoalProgressUseCase,
  ) {}

  async execute(input: RecomputeGoalProgressInput): Promise<Result<void, never>> {
    const tally = await this.workload.tally(input.goalId);
    // Cancelling the last live task must not reset an objective to zero.
    if (tally.total === 0) {
      return Result.ok(undefined);
    }
    await this.updateProgress.execute({
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      progress: Math.round((tally.completed / tally.total) * 100),
    });
    return Result.ok(undefined);
  }
}
