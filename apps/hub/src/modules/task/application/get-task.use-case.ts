import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { TaskNotFoundError } from "../domain/task.errors";

export interface GetTaskInput {
  taskId: string;
  workspaceId?: string;
}

@Injectable()
export class GetTaskUseCase
  implements UseCase<GetTaskInput, Result<Task, TaskNotFoundError>>
{
  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository) {}

  async execute(input: GetTaskInput): Promise<Result<Task, TaskNotFoundError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || (input.workspaceId && task.workspaceId !== input.workspaceId)) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }
    return Result.ok(task);
  }
}
