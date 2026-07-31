import { ActorType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { TaskValidationNotPendingError } from "../domain/task.errors";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import { TaskNotFoundError } from "./task-application.errors";

export interface RejectTaskInput {
  taskId: string;
  updatedByType: ActorType;
  updatedById: string;
}

export type RejectTaskError = TaskNotFoundError | TaskValidationNotPendingError;

@Injectable()
export class RejectTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly goalProgressSync: GoalProgressSyncService,
  ) {}

  async execute(input: RejectTaskInput): Promise<Result<Task, RejectTaskError>> {
    const task = await this.tasks.findById(UniqueEntityId.create(input.taskId));
    if (!task) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    try {
      task.reject({ type: input.updatedByType, id: input.updatedById });
    } catch (error) {
      if (error instanceof TaskValidationNotPendingError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.tasks.save(task);
    await this.goalProgressSync.syncIfNeeded(task.goalId);

    return Result.ok(task);
  }
}
