import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { BlockerType } from "../domain/blocker";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { TaskNotEditableError, TaskNotFoundError } from "../domain/task.errors";

export interface ReportBlockerInput {
  taskId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
  type: BlockerType;
  description: string;
  reporterType: ActorType;
  reporterId: string;
}

export type ReportBlockerError =
  | TaskNotFoundError
  | GuardViolation
  | TaskNotEditableError;

@Injectable()
export class ReportBlockerUseCase
  implements
    UseCase<ReportBlockerInput, Result<{ blockerId: string }, ReportBlockerError>>
{
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ReportBlockerInput,
  ): Promise<Result<{ blockerId: string }, ReportBlockerError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || task.workspaceId !== input.workspaceId) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }
    const reporter = ActorRef.create(input.reporterType, input.reporterId);
    if (reporter.isFailure) {
      return Result.fail(reporter.error);
    }

    const reported = task.reportBlocker(
      { type: input.type, description: input.description, reportedBy: reporter.value },
      this.clock.now(),
    );
    if (reported.isFailure) {
      return Result.fail(reported.error);
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
    return Result.ok({ blockerId: reported.value });
  }
}
