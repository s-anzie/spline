import { ActorType, Priority } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { wouldCreateCycle } from "../../../kernel/domain/dependency-graph";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { EmptyTaskTitleError, SelfTaskDependencyError } from "../domain/task.errors";
import {
  CircularTaskDependencyError,
  DependencyTaskNotFoundError,
  TaskNotFoundError,
} from "./task-application.errors";

export interface UpdateTaskDetailsInput {
  taskId: string;
  title?: string;
  description?: string;
  priority?: Priority;
  dependencies?: string[];
  updatedByType: ActorType;
  updatedById: string;
}

export type UpdateTaskDetailsError =
  | TaskNotFoundError
  | EmptyTaskTitleError
  | SelfTaskDependencyError
  | DependencyTaskNotFoundError
  | CircularTaskDependencyError;

@Injectable()
export class UpdateTaskDetailsUseCase {
  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository) {}

  async execute(input: UpdateTaskDetailsInput): Promise<Result<Task, UpdateTaskDetailsError>> {
    const task = await this.tasks.findById(UniqueEntityId.create(input.taskId));
    if (!task) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    if (input.dependencies && input.dependencies.length > 0) {
      if (input.dependencies.includes(task.id.toString())) {
        return Result.fail(new SelfTaskDependencyError(task.id.toString()));
      }

      const dependencyTasks = await this.tasks.findByIds(input.dependencies);
      const tasksById = new Map(dependencyTasks.map((t) => [t.id.toString(), t]));
      const missingOrForeign = input.dependencies.filter((id) => {
        const found = tasksById.get(id);
        return !found || found.workspaceId !== task.workspaceId;
      });
      if (missingOrForeign.length > 0) {
        return Result.fail(new DependencyTaskNotFoundError(missingOrForeign));
      }

      if (wouldCreateCycle(task.id.toString(), input.dependencies, tasksById)) {
        return Result.fail(new CircularTaskDependencyError(task.id.toString()));
      }
    }

    try {
      task.updateDetails(input, { type: input.updatedByType, id: input.updatedById });
    } catch (error) {
      if (error instanceof EmptyTaskTitleError || error instanceof SelfTaskDependencyError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.tasks.save(task);
    return Result.ok(task);
  }
}
