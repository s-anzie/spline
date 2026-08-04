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
import { TASK_REPOSITORY, TaskRepository } from "../../task/domain/ports/task.repository.port";
import { TaskNotFoundError } from "../../task/domain/task.errors";
import { Validation } from "../domain/validation";
import {
  VALIDATION_REPOSITORY,
  ValidationRepository,
} from "../domain/ports/validation.repository.port";

export interface RequestedValidation {
  type: string;
  mandatory?: boolean;
  dependsOnValidationIds?: readonly string[];
}

export interface RequestValidationInput {
  workspaceId: string;
  taskId: string;
  requestedByType: ActorType;
  requestedById: string;
  validations: readonly RequestedValidation[];
}

export type RequestValidationError = GuardViolation | TaskNotFoundError;

/**
 * §11.4 — an agent asks for proof; it never declares its own success (§10.9).
 * Several at once because §11.9 describes a graph, not a single check.
 */
@Injectable()
export class RequestValidationUseCase
  implements
    UseCase<
      RequestValidationInput,
      Result<{ validationIds: string[] }, RequestValidationError>
    >
{
  constructor(
    @Inject(VALIDATION_REPOSITORY)
    private readonly validations: ValidationRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RequestValidationInput,
  ): Promise<Result<{ validationIds: string[] }, RequestValidationError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || task.workspaceId !== input.workspaceId) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }
    const requestedBy = ActorRef.create(input.requestedByType, input.requestedById);
    if (requestedBy.isFailure) {
      return Result.fail(requestedBy.error);
    }

    const now = this.clock.now();
    const created: Validation[] = [];
    for (const asked of input.validations) {
      const validation = Validation.request({
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        type: asked.type,
        // Explicit: choosing a default would be inventing a policy (§12).
        mandatory: asked.mandatory ?? true,
        dependsOnValidationIds: asked.dependsOnValidationIds,
        requestedBy: requestedBy.value,
        now,
      });
      if (validation.isFailure) {
        return Result.fail(validation.error);
      }
      created.push(validation.value);
    }

    for (const validation of created) {
      await this.validations.save(validation);
      await flushDomainEvents(validation, this.publisher);
    }
    return Result.ok({ validationIds: created.map((v) => v.id.value) });
  }
}
