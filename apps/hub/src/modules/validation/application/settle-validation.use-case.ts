import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import {
  TASK_ASSIGNEE,
  TaskAssignee,
} from "../../task/domain/ports/task-assignee.port";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { CannotJudgeOwnWorkError, ValidationNotFoundError } from "../domain/validation.errors";
import {
  VALIDATION_REPOSITORY,
  ValidationRepository,
} from "../domain/ports/validation.repository.port";

export type SettleAction = "START" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "CANCELLED";

export interface SettleValidationInput {
  workspaceId: string;
  validationId: string;
  action: SettleAction;
  actorType: ActorType;
  actorId: string;
  output?: string;
  reportArtifactIds?: readonly string[];
}

export type SettleValidationError =
  | CannotJudgeOwnWorkError
  | ValidationNotFoundError
  | GuardViolation
  | InvalidStateTransitionError;

/**
 * §11.5 — one door for every move of a validation's life, because they share
 * the same lookup, the same isolation check and the same publication. The
 * verb is in the payload, not in six near-identical use cases.
 */
@Injectable()
export class SettleValidationUseCase
  implements UseCase<SettleValidationInput, Result<void, SettleValidationError>>
{
  constructor(
    @Inject(VALIDATION_REPOSITORY)
    private readonly validations: ValidationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(TASK_ASSIGNEE) private readonly tasks: TaskAssignee,
  ) {}

  async execute(
    input: SettleValidationInput,
  ): Promise<Result<void, SettleValidationError>> {
    const validation = await this.validations.findById(input.validationId);
    if (!validation || validation.workspaceId !== input.workspaceId) {
      return Result.fail(new ValidationNotFoundError(input.validationId));
    }
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    /**
     * §10.9, absolutely: an agent never pronounces on its own work.
     *
     * Checked here rather than in the permission matrix because it is not
     * about a ROLE — a manager may judge its team's work once an owner lends
     * it that power (§18.3), and the very next thing to make sure of is that
     * the same power does not reach its own tasks. A rule about who you are
     * cannot express a rule about whose work it is.
     *
     * Only agents. A person judging work assigned to them is an ordinary
     * review, and forbidding it would stop an operator finishing their own
     * task — which nothing in §10.9 is about.
     */
    if (actor.value.type === "AGENT") {
      const assignee = await this.tasks.assigneeOf(
        input.workspaceId,
        validation.taskId,
      );
      if (
        assignee &&
        assignee.type === actor.value.type &&
        assignee.actorId === actor.value.actorId
      ) {
        return Result.fail(new CannotJudgeOwnWorkError(validation.taskId));
      }
    }

    const now = this.clock.now();
    const moved = this.apply(validation, input, actor.value, now);
    if (moved.isFailure) {
      return Result.fail(moved.error);
    }

    await this.validations.save(validation);
    await flushDomainEvents(validation, this.publisher);
    return Result.ok(undefined);
  }

  private apply(
    validation: Awaited<ReturnType<ValidationRepository["findById"]>> & object,
    input: SettleValidationInput,
    actor: ActorRef,
    now: Date,
  ): Result<void, InvalidStateTransitionError | GuardViolation> {
    switch (input.action) {
      case "START":
        return validation.start(now);
      case "SKIPPED":
        return validation.skip(input.output ?? "skipped", now);
      case "CANCELLED":
        return validation.cancel(now);
      case "SUCCEEDED":
      case "FAILED":
        return validation.record({
          outcome: input.action,
          executedBy: actor,
          output: input.output,
          reportArtifactIds: input.reportArtifactIds,
          now,
        });
    }
  }
}
