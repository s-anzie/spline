import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import {
  VALIDATION_REPOSITORY,
  ValidationRepository,
} from "../domain/ports/validation.repository.port";

export interface InvalidateValidationsInput {
  workspaceId: string;
  taskId: string;
  reason: string;
}

/**
 * §11.8 — "toute modification importante invalide automatiquement les
 * validations précédentes". Explicit, never guessed here: deciding what
 * counts as an important change belongs to whoever observes it (a new commit
 * for the Repository Engine §8, a rule change for Policy §12). Inferring it
 * would be an unverifiable heuristic.
 */
@Injectable()
export class InvalidateValidationsUseCase
  implements
    UseCase<InvalidateValidationsInput, Result<{ invalidated: number }, GuardViolation>>
{
  constructor(
    @Inject(VALIDATION_REPOSITORY)
    private readonly validations: ValidationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: InvalidateValidationsInput,
  ): Promise<Result<{ invalidated: number }, GuardViolation>> {
    const reason = Guard.againstEmpty(input.reason, "reason");
    if (reason.isFailure) {
      return Result.fail(reason.error);
    }

    const now = this.clock.now();
    let count = 0;
    for (const validation of await this.validations.listByTask(input.taskId)) {
      if (validation.workspaceId !== input.workspaceId || validation.isInvalidated) {
        continue;
      }
      const invalidated = validation.invalidate(reason.value, now);
      if (invalidated.isFailure) {
        return Result.fail(invalidated.error);
      }
      await this.validations.save(validation);
      await flushDomainEvents(validation, this.publisher);
      count++;
    }
    return Result.ok({ invalidated: count });
  }
}
