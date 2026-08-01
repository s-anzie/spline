import { EventReceiptStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Actor, EventReceipt } from "../domain/event-receipt";
import {
  EVENT_RECEIPT_REPOSITORY,
  EventReceiptRepository,
} from "../domain/ports/event-receipt.repository.port";
import { EVENT_REPOSITORY, EventRepository } from "../domain/ports/event.repository.port";
import { EventNotFoundError } from "./event-application.errors";

export interface RecordEventReceiptInput {
  eventId: string;
  actor: Actor;
  status: EventReceiptStatus;
}

export type RecordEventReceiptError = EventNotFoundError;

/** Upsert-by-(event, actor): creates the actor's first receipt, or advances their existing one — never a duplicate row. */
@Injectable()
export class RecordEventReceiptUseCase {
  constructor(
    @Inject(EVENT_RECEIPT_REPOSITORY) private readonly receipts: EventReceiptRepository,
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RecordEventReceiptInput): Promise<Result<EventReceipt, RecordEventReceiptError>> {
    const event = await this.events.findById(UniqueEntityId.create(input.eventId));
    if (!event) {
      return Result.fail(new EventNotFoundError(input.eventId));
    }

    const now = this.clock.now();
    const existing = await this.receipts.findByEventAndActor(input.eventId, input.actor.type, input.actor.id);

    const receipt =
      existing ?? EventReceipt.mark({ eventId: input.eventId, actor: input.actor, status: input.status }, now);
    if (existing) {
      existing.advanceTo(input.status, now);
    }

    await this.receipts.save(receipt);
    return Result.ok(receipt);
  }
}
