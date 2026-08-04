import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { GOAL_REPOSITORY, GoalRepository } from "../../goal/domain/ports/goal.repository.port";
import { TASK_REPOSITORY, TaskRepository } from "../../task/domain/ports/task.repository.port";
import { ArtifactLinkError } from "../domain/artifact.errors";

export interface LinkTargets {
  goalId?: string;
  taskId?: string;
  repositoryId?: string;
}

/**
 * The schema carries real foreign keys to goals and tasks, so a link must be
 * checked before it reaches the database — a dangling reference is a 500, and
 * a silent one would be worse. repositoryId stays unchecked until the
 * Repository Engine owns that table (§8).
 */
@Injectable()
export class ArtifactLinkTargets {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
  ) {}

  async verify(
    workspaceId: string,
    targets: LinkTargets,
  ): Promise<Result<void, ArtifactLinkError>> {
    if (targets.goalId !== undefined) {
      const goal = await this.goals.findById(targets.goalId);
      if (!goal) {
        return Result.fail(new ArtifactLinkError(`goal "${targets.goalId}" does not exist`));
      }
      if (goal.workspaceId !== workspaceId) {
        return Result.fail(new ArtifactLinkError("the goal belongs to another workspace"));
      }
    }
    if (targets.taskId !== undefined) {
      const task = await this.tasks.findById(targets.taskId);
      if (!task) {
        return Result.fail(new ArtifactLinkError(`task "${targets.taskId}" does not exist`));
      }
      if (task.workspaceId !== workspaceId) {
        return Result.fail(new ArtifactLinkError("the task belongs to another workspace"));
      }
    }
    return Result.ok(undefined);
  }
}
