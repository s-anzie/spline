import { Inject, Injectable } from "@nestjs/common";

import { UpdateGoalProgressUseCase } from "../../goal/application/update-goal-progress.use-case";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";

/**
 * Settles the debt left by the goal module: goal progress is fed by task
 * outcomes. The dependency runs task → goal only; a goal never reads tasks.
 */
@Injectable()
export class GoalProgressSyncService {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly updateGoalProgress: UpdateGoalProgressUseCase,
  ) {}

  async sync(goalId: string): Promise<void> {
    const tally = await this.tasks.tallyByGoal(goalId);
    // Cancelling the last live task must not reset an objective to zero.
    if (tally.total === 0) {
      return;
    }
    await this.updateGoalProgress.execute({
      goalId,
      progress: Math.round((tally.completed / tally.total) * 100),
    });
  }
}
