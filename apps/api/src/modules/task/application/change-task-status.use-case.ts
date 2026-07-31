import { ActorType, TaskStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { InvalidTaskStatusTransitionError } from "../domain/task.errors";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import { TaskNotFoundError, UnmetTaskDependenciesError } from "./task-application.errors";

export interface ChangeTaskStatusInput {
  taskId: string;
  status: TaskStatus;
  updatedByType: ActorType;
  updatedById: string;
}

export type ChangeTaskStatusError =
  | TaskNotFoundError
  | InvalidTaskStatusTransitionError
  | UnmetTaskDependenciesError;

@Injectable()
export class ChangeTaskStatusUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly goalProgressSync: GoalProgressSyncService,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: ChangeTaskStatusInput): Promise<Result<Task, ChangeTaskStatusError>> {
    const task = await this.tasks.findById(UniqueEntityId.create(input.taskId));
    if (!task) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    if (input.status === TaskStatus.IN_PROGRESS && task.dependencies.length > 0) {
      const dependencyTasks = await this.tasks.findByIds([...task.dependencies]);
      const unmet = dependencyTasks
        .filter((dep) => dep.status !== TaskStatus.DONE)
        .map((dep) => dep.id.toString());
      if (unmet.length > 0) {
        return Result.fail(new UnmetTaskDependenciesError(task.id.toString(), unmet));
      }
    }

    try {
      task.changeStatus(input.status, { type: input.updatedByType, id: input.updatedById });
    } catch (error) {
      if (error instanceof InvalidTaskStatusTransitionError) {
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
