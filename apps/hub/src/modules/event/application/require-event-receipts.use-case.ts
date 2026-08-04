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
import { EventReceipt } from "../domain/event-receipt";
import { EventNotFoundError } from "../domain/event.errors";
import {
  EVENT_RECEIPT_REPOSITORY,
  EVENT_REPOSITORY,
  EventReceiptRepository,
  EventRepository,
} from "../domain/ports/event.repository.port";

export interface RequireEventReceiptsInput {
  eventId: string;
  actors: readonly { actorType: ActorType; actorId: string }[];
}

/**
 * §14.4 — some facts need an actor to confirm they took notice. The receipts
 * are materialised now, one per actor, never derived at read time: that is
 * the v1 lesson restored in §4.20, and the reason a broadcast can be
 * acknowledged individually at all.
 */
@Injectable()
export class RequireEventReceiptsUseCase
  implements
    UseCase<
      RequireEventReceiptsInput,
      Result<{ receiptIds: string[] }, EventNotFoundError | GuardViolation>
    >
{
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(EVENT_RECEIPT_REPOSITORY)
    private readonly receipts: EventReceiptRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RequireEventReceiptsInput,
  ): Promise<Result<{ receiptIds: string[] }, EventNotFoundError | GuardViolation>> {
    const event = await this.events.findById(input.eventId);
    if (!event) {
      return Result.fail(new EventNotFoundError(input.eventId));
    }

    const now = this.clock.now();
    const receiptIds: string[] = [];
    for (const target of input.actors) {
      const actor = ActorRef.create(target.actorType, target.actorId);
      if (actor.isFailure) {
        return Result.fail(actor.error);
      }
      // Asking twice must not produce two receipts for the same actor.
      const existing = await this.receipts.findByEventAndActor(
        input.eventId,
        actor.value,
      );
      if (existing) {
        receiptIds.push(existing.id.value);
        continue;
      }

      const receipt = EventReceipt.require({
        eventId: input.eventId,
        actor: actor.value,
        now,
      }).value;
      await this.receipts.save(receipt);
      await flushDomainEvents(receipt, this.publisher);
      receiptIds.push(receipt.id.value);
    }
    return Result.ok({ receiptIds });
  }
}
