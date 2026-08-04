import { Injectable } from "@nestjs/common";

import { RecomputeGoalProgressUseCase } from "../../goal/application/recompute-goal-progress.use-case";

/**
 * Task-side trigger. The formula itself belongs to the Goal Engine (§5.6);
 * this only says "the work moved, recompute" — the dependency runs task → goal
 * and never the other way.
 */
@Injectable()
export class GoalProgressSyncService {
  constructor(private readonly recompute: RecomputeGoalProgressUseCase) {}

  async sync(workspaceId: string, goalId: string): Promise<void> {
    await this.recompute.execute({ workspaceId, goalId });
  }
}
