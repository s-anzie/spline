import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { TaskNotFoundError } from "./task-application.errors";

@Injectable()
export class GetTaskUseCase {
  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository) {}

  async execute(taskId: string): Promise<Result<Task, TaskNotFoundError>> {
    const task = await this.tasks.findById(UniqueEntityId.create(taskId));
    if (!task) {
      return Result.fail(new TaskNotFoundError(taskId));
    }
    return Result.ok(task);
  }
}
