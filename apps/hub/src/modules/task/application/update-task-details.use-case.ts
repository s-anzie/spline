import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Priority } from "../../../kernel/domain/priority";
import { Result } from "../../../kernel/domain/result";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { UpdateTaskDetailsError } from "../domain/task";
import { TaskNotFoundError } from "../domain/task.errors";

export interface UpdateTaskDetailsInput {
  taskId: string;
  workspaceId?: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: readonly string[];
  priority?: Priority;
  estimatedCost?: number;
  estimatedDurationMinutes?: number;
  repositoryId?: string;
}

@Injectable()
export class UpdateTaskDetailsUseCase
  implements
    UseCase<UpdateTaskDetailsInput, Result<void, TaskNotFoundError | UpdateTaskDetailsError>>
{
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: UpdateTaskDetailsInput,
  ): Promise<Result<void, TaskNotFoundError | UpdateTaskDetailsError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || (input.workspaceId && task.workspaceId !== input.workspaceId)) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    const updated = task.updateDetails(
      {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.acceptanceCriteria !== undefined && {
          acceptanceCriteria: input.acceptanceCriteria,
        }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.estimatedCost !== undefined && { estimatedCost: input.estimatedCost }),
        ...(input.estimatedDurationMinutes !== undefined && {
          estimatedDurationMinutes: input.estimatedDurationMinutes,
        }),
        ...(input.repositoryId !== undefined && { repositoryId: input.repositoryId }),
      },
      this.clock.now(),
    );
    if (updated.isFailure) {
      return Result.fail(updated.error);
    }

    await this.tasks.save(task);
    flushDomainEvents(task, this.publisher);
    return Result.ok(undefined);
  }
}
