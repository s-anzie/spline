import { TaskStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { RecalculateGoalProgressUseCase } from "../../goal/application/recalculate-goal-progress.use-case";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";

/** Keeps a Goal's progress in sync with its tasks — Goal never has to know Task exists. */
@Injectable()
export class GoalProgressSyncService {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly recalculateGoalProgress: RecalculateGoalProgressUseCase,
  ) {}

  async syncIfNeeded(goalId: string | undefined): Promise<void> {
    if (!goalId) {
      return;
    }

    const tasks = await this.tasks.listByGoal(goalId);
    const relevant = tasks.filter((task) => task.status !== TaskStatus.CANCELLED);
    const completedTaskCount = relevant.filter((task) => task.status === TaskStatus.DONE).length;

    await this.recalculateGoalProgress.execute({
      goalId,
      completedTaskCount,
      totalTaskCount: relevant.length,
    });
  }
}
