import { Global, Inject, Injectable, Module } from "@nestjs/common";

import { ActorRef } from "../../identity/domain/actor";
import {
  DISPATCHABLE_TASK,
  DispatchableTask,
  TASK_ASSIGNEE,
  TaskAssignee,
  TaskBriefing,
} from "../../runtime/domain/ports/dispatch.port";
import { GOAL_REPOSITORY, GoalRepository } from "../../goal/domain/ports/goal.repository.port";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { TaskModule } from "../task.module";
import { GoalModule } from "../../goal/goal.module";
import {
  REPOSITORY_STORE,
  RepositoryStore,
} from "../../repository/domain/ports/repository.repository.port";
import { RepositoryModule } from "../../repository/repository.module";

/** The states from which handing a task to a machine makes sense. */
const DISPATCHABLE = new Set(["READY", "ASSIGNED", "RUNNING"]);

/**
 * §6.8 — supplies what runtime declares. Only this module knows what a task's
 * states mean, so only this module decides which of them may be dispatched.
 *
 * One call returns both the verdict and the content, so the answer cannot be
 * true when read and false when used.
 */
@Injectable()
export class DispatchableTaskAdapter implements DispatchableTask, TaskAssignee {
  /**
   * §18.10 — whose authority an order borrows. The task's own assignee, so a
   * machine can never choose.
   */
  async assigneeOf(workspaceId: string, taskId: string): Promise<ActorRef | null> {
    const task = await this.tasks.findById(taskId);
    return task && task.workspaceId === workspaceId ? task.assignee : null;
  }

  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(REPOSITORY_STORE) private readonly repositories: RepositoryStore,
  ) {}

  async briefingFor(workspaceId: string, taskId: string): Promise<TaskBriefing> {
    const task = await this.tasks.findById(taskId);
    // §4.2 — a task of another workspace is simply not there.
    if (!task || task.workspaceId !== workspaceId) {
      return { dispatchable: false, reason: `Task "${taskId}" was not found` };
    }
    if (!DISPATCHABLE.has(task.status)) {
      return {
        dispatchable: false,
        reason:
          `A ${task.status} task cannot be handed to a machine. From here it ` +
          `can go to: ${task.allowedStatusTargets().join(", ") || "nowhere"} (§6.8)`,
      };
    }

    /**
     * The goal's title travels into the prompt because an agent that knows
     * only its task does not know what the task is for — and §10.5 asks it to
     * plan, which needs the objective.
     */
    const goal = await this.goals.findById(task.goalId);

    /**
     * §8.3 — where the work happens, when it happens in code.
     *
     * Read here rather than at dispatch because this is the one place that
     * already has the task in hand. Absent is normal: a task that names no
     * repository gets a working directory and no branch, which is what every
     * task got before repositories were carried through at all.
     */
    const repository = task.repositoryId
      ? await this.repositories.findById(task.repositoryId)
      : null;

    return {
      dispatchable: true,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      goalTitle: goal?.title ?? null,
      goalId: goal?.id.value ?? null,
      repository:
        repository && repository.workspaceId === workspaceId
          ? {
              id: repository.id.value,
              origin: repository.origin,
              baseBranch: repository.defaultBranch,
              // §8.11 — asked of the repository, which already unions the
              // three §8.3 names with its default branch and whatever the
              // workspace added. Rebuilding that list here would be a second
              // answer to the same question, drifting from the first.
              protectedBranches: repository.protectedBranches,
            }
          : null,
    };
  }
}

/** Global, and importing TaskModule: see the note in task-retry.adapter.ts. */
@Global()
@Module({
  imports: [TaskModule, GoalModule, RepositoryModule],
  providers: [
    DispatchableTaskAdapter,
    { provide: DISPATCHABLE_TASK, useExisting: DispatchableTaskAdapter },
    { provide: TASK_ASSIGNEE, useExisting: DispatchableTaskAdapter },
  ],
  exports: [DISPATCHABLE_TASK, TASK_ASSIGNEE],
})
export class DispatchableTaskModule {}
