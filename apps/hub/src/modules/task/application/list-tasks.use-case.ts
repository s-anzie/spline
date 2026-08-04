import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { comparePriority } from "../../../kernel/domain/priority";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task, TaskStatus } from "../domain/task";

export interface ListTasksInput {
  workspaceId: string;
  goalId?: string;
  statuses?: readonly TaskStatus[];
  assigneeType?: ActorType;
  assigneeId?: string;
}

@Injectable()
export class ListTasksUseCase implements UseCase<ListTasksInput, Result<Task[], never>> {
  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository) {}

  async execute(input: ListTasksInput): Promise<Result<Task[], never>> {
    const assignee =
      input.assigneeType && input.assigneeId
        ? ActorRef.create(input.assigneeType, input.assigneeId)
        : null;

    const tasks = await this.tasks.list({
      workspaceId: input.workspaceId,
      ...(input.goalId !== undefined && { goalId: input.goalId }),
      ...(input.statuses !== undefined && { statuses: input.statuses }),
      ...(assignee?.isSuccess && { assignee: assignee.value }),
    });
    const sorted = [...tasks].sort(
      (a, b) =>
        comparePriority(a.priority, b.priority) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return Result.ok(sorted);
  }
}
