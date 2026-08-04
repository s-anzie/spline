import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Event } from "../domain/event";
import { EventReceipt, ReceiptStatus } from "../domain/event-receipt";
import {
  EVENT_RECEIPT_REPOSITORY,
  EVENT_REPOSITORY,
  EventReceiptRepository,
  EventRepository,
} from "../domain/ports/event.repository.port";

export interface ListPendingReceiptsInput {
  actorType: ActorType;
  actorId: string;
  statuses?: readonly ReceiptStatus[];
}

export interface PendingReceipt {
  receipt: EventReceipt;
  event: Event | null;
}

/** "What do I still have to take notice of?", always scoped to one actor. */
const UNSETTLED: readonly ReceiptStatus[] = ["PENDING", "SEEN", "ACKNOWLEDGED"];

@Injectable()
export class ListPendingReceiptsUseCase
  implements
    UseCase<ListPendingReceiptsInput, Result<PendingReceipt[], GuardViolation>>
{
  constructor(
    @Inject(EVENT_RECEIPT_REPOSITORY)
    private readonly receipts: EventReceiptRepository,
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
  ) {}

  async execute(
    input: ListPendingReceiptsInput,
  ): Promise<Result<PendingReceipt[], GuardViolation>> {
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    const receipts = await this.receipts.list({
      actor: actor.value,
      statuses: input.statuses ?? UNSETTLED,
    });
    return Result.ok(
      await Promise.all(
        receipts.map(async (receipt) => ({
          receipt,
          event: await this.events.findById(receipt.eventId),
        })),
      ),
    );
  }
}
