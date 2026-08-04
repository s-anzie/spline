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
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { ReceiptStatus } from "../domain/event-receipt";
import { EventReceiptNotFoundError } from "../domain/event.errors";
import {
  EVENT_RECEIPT_REPOSITORY,
  EventReceiptRepository,
} from "../domain/ports/event.repository.port";

export interface AdvanceEventReceiptInput {
  eventId: string;
  actorType: ActorType;
  actorId: string;
  status: ReceiptStatus;
}

export type AdvanceEventReceiptError =
  | EventReceiptNotFoundError
  | GuardViolation
  | InvalidStateTransitionError;

/** An actor declares, for themselves, that they saw / acknowledged / acted. */
@Injectable()
export class AdvanceEventReceiptUseCase
  implements UseCase<AdvanceEventReceiptInput, Result<void, AdvanceEventReceiptError>>
{
  constructor(
    @Inject(EVENT_RECEIPT_REPOSITORY)
    private readonly receipts: EventReceiptRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: AdvanceEventReceiptInput,
  ): Promise<Result<void, AdvanceEventReceiptError>> {
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }
    const receipt = await this.receipts.findByEventAndActor(input.eventId, actor.value);
    if (!receipt) {
      return Result.fail(new EventReceiptNotFoundError(input.eventId));
    }

    const advanced = receipt.advanceTo(input.status, this.clock.now());
    if (advanced.isFailure) {
      return Result.fail(advanced.error);
    }

    await this.receipts.save(receipt);
    await flushDomainEvents(receipt, this.publisher);
    return Result.ok(undefined);
  }
}
