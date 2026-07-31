import { Inject, Injectable } from "@nestjs/common";

import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";

@Injectable()
export class ListTasksByWorkspaceUseCase {
  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository) {}

  async execute(workspaceId: string, goalId?: string): Promise<Task[]> {
    return this.tasks.listByWorkspace(workspaceId, goalId);
  }
}
