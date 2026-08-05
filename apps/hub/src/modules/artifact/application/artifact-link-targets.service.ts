import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { GOAL_REPOSITORY, GoalRepository } from "../../goal/domain/ports/goal.repository.port";
import {
  DECISION_REPOSITORY,
  DecisionRepository,
} from "../../decision/domain/ports/decision.repository.port";
import {
  REPOSITORY_STORE,
  RepositoryStore,
} from "../../repository/domain/ports/repository.repository.port";
import { TASK_REPOSITORY, TaskRepository } from "../../task/domain/ports/task.repository.port";
import { ArtifactLinkError } from "../domain/artifact.errors";

export interface LinkTargets {
  goalId?: string;
  taskId?: string;
  repositoryId?: string;
  decisionId?: string;
}

/**
 * The schema carries real foreign keys, so a link must be checked before it
 * reaches the database — a dangling reference is a 500, and a silent one
 * would be worse.
 *
 * `repositoryId` was the one left unchecked, "until the Repository Engine
 * owns that table (§8)". It does now, so it is checked like the others — a
 * deferral is a debt, and the module that closes it has arrived.
 */
@Injectable()
export class ArtifactLinkTargets {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository,
    @Inject(REPOSITORY_STORE) private readonly repositories: RepositoryStore,
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
    if (targets.decisionId !== undefined) {
      const decision = await this.decisions.findById(targets.decisionId);
      if (!decision) {
        return Result.fail(
          new ArtifactLinkError(`decision "${targets.decisionId}" does not exist`),
        );
      }
      if (decision.workspaceId !== workspaceId) {
        return Result.fail(
          new ArtifactLinkError("the decision belongs to another workspace"),
        );
      }
    }
    if (targets.repositoryId !== undefined) {
      const repository = await this.repositories.findById(targets.repositoryId);
      if (!repository) {
        return Result.fail(
          new ArtifactLinkError(`repository "${targets.repositoryId}" does not exist`),
        );
      }
      if (repository.workspaceId !== workspaceId) {
        return Result.fail(
          new ArtifactLinkError("the repository belongs to another workspace"),
        );
      }
    }
    return Result.ok(undefined);
  }
}
