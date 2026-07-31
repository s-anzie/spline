import { Inject, Injectable } from "@nestjs/common";

import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";
import { Goal } from "../domain/goal";

@Injectable()
export class ListGoalsByWorkspaceUseCase {
  constructor(@Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository) {}

  async execute(workspaceId: string): Promise<Goal[]> {
    return this.goals.listByWorkspace(workspaceId);
  }
}
