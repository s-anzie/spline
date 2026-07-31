import { ActorType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { EmptyBlockerReasonError } from "../domain/task.errors";
import { TaskNotFoundError } from "./task-application.errors";

export interface ReportTaskBlockerInput {
  taskId: string;
  reason: string;
  reporterType: ActorType;
  reporterId: string;
}

export type ReportTaskBlockerError = TaskNotFoundError | EmptyBlockerReasonError;

@Injectable()
export class ReportTaskBlockerUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: ReportTaskBlockerInput): Promise<Result<Task, ReportTaskBlockerError>> {
    const task = await this.tasks.findById(UniqueEntityId.create(input.taskId));
    if (!task) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    try {
      task.reportBlocker(input.reason, { type: input.reporterType, id: input.reporterId });
    } catch (error) {
      if (error instanceof EmptyBlockerReasonError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.tasks.save(task);
    this.eventPublisher.publishAll(task.domainEvents);
    task.clearEvents();

    return Result.ok(task);
  }
}
