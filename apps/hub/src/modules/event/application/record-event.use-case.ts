import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Event } from "../domain/event";
import { EventSeverity } from "../domain/event-severity";
import { EVENT_REPOSITORY, EventRepository } from "../domain/ports/event.repository.port";

export interface RecordEventInput {
  workspaceId: string | null;
  type: string;
  targetType: string;
  targetId: string;
  severity?: EventSeverity;
  payload?: Record<string, unknown>;
  actorType?: ActorType;
  actorId?: string;
}

export interface RecordEventOutput {
  eventId: string;
  sequence: string;
}

/**
 * Explicit recording, for facts that have no aggregate behind them: a Worker
 * reporting (§6.8 PublishEvent), the Scheduler (§9.15), an extension.
 */
@Injectable()
export class RecordEventUseCase
  implements UseCase<RecordEventInput, Result<RecordEventOutput, GuardViolation>>
{
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: RecordEventInput,
  ): Promise<Result<RecordEventOutput, GuardViolation>> {
    const actor =
      input.actorType && input.actorId
        ? ActorRef.create(input.actorType, input.actorId)
        : null;
    if (actor?.isFailure) {
      return Result.fail(actor.error);
    }

    const event = Event.record({
      workspaceId: input.workspaceId,
      type: input.type,
      targetType: input.targetType,
      targetId: input.targetId,
      ...(input.severity !== undefined && { severity: input.severity }),
      ...(input.payload !== undefined && { payload: input.payload }),
      ...(actor?.isSuccess && { actor: actor.value }),
      now: this.clock.now(),
    });
    if (event.isFailure) {
      return Result.fail(event.error);
    }

    const stored = await this.events.append(event.value);
    return Result.ok({
      eventId: stored.id.value,
      sequence: stored.sequence.toString(),
    });
  }
}
