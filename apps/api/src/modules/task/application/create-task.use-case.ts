import { ActorType, GoalStatus, Priority } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { GetGoalUseCase } from "../../goal/application/get-goal.use-case";
import { ListGoalsByWorkspaceUseCase } from "../../goal/application/list-goals-by-workspace.use-case";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { EmptyTaskTitleError } from "../domain/task.errors";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import {
  DependencyTaskNotFoundError,
  GoalNotInWorkspaceError,
  OrphanTaskNotAllowedError,
} from "./task-application.errors";

export interface CreateTaskInput {
  workspaceId: string;
  goalId?: string;
  title: string;
  description?: string;
  priority?: Priority;
  dependencies?: string[];
  createdByType: ActorType;
  createdById: string;
}

export type CreateTaskError =
  | WorkspaceNotFoundError
  | GoalNotInWorkspaceError
  | OrphanTaskNotAllowedError
  | DependencyTaskNotFoundError
  | EmptyTaskTitleError;

@Injectable()
export class CreateTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly getGoal: GetGoalUseCase,
    private readonly listGoalsByWorkspace: ListGoalsByWorkspaceUseCase,
    private readonly goalProgressSync: GoalProgressSyncService,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: CreateTaskInput): Promise<Result<Task, CreateTaskError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    if (input.goalId) {
      const goalResult = await this.getGoal.execute(input.goalId);
      if (goalResult.isFailure) {
        return Result.fail(goalResult.error);
      }
      if (goalResult.value.workspaceId !== input.workspaceId) {
        return Result.fail(new GoalNotInWorkspaceError(input.goalId, input.workspaceId));
      }
    } else {
      const workspaceGoals = await this.listGoalsByWorkspace.execute(input.workspaceId);
      if (workspaceGoals.some((goal) => goal.status === GoalStatus.ACTIVE)) {
        return Result.fail(new OrphanTaskNotAllowedError(input.workspaceId));
      }
    }

    if (input.dependencies && input.dependencies.length > 0) {
      const dependencyTasks = await this.tasks.findByIds(input.dependencies);
      const foundIds = new Set(dependencyTasks.map((t) => t.id.toString()));
      const missingOrForeign = input.dependencies.filter(
        (id) =>
          !foundIds.has(id) ||
          dependencyTasks.find((t) => t.id.toString() === id)?.workspaceId !== input.workspaceId,
      );
      if (missingOrForeign.length > 0) {
        return Result.fail(new DependencyTaskNotFoundError(missingOrForeign));
      }
    }

    let task: Task;
    try {
      task = Task.create(input);
    } catch (error) {
      if (error instanceof EmptyTaskTitleError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.tasks.save(task);
    await this.goalProgressSync.syncIfNeeded(task.goalId);
    this.eventPublisher.publishAll(task.domainEvents);
    task.clearEvents();

    return Result.ok(task);
  }
}
