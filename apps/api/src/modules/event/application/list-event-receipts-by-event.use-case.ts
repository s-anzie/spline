import { Inject, Injectable } from "@nestjs/common";

import { EventReceipt } from "../domain/event-receipt";
import {
  EVENT_RECEIPT_REPOSITORY,
  EventReceiptRepository,
} from "../domain/ports/event-receipt.repository.port";

@Injectable()
export class ListEventReceiptsByEventUseCase {
  constructor(@Inject(EVENT_RECEIPT_REPOSITORY) private readonly receipts: EventReceiptRepository) {}

  async execute(eventId: string): Promise<EventReceipt[]> {
    return this.receipts.listByEvent(eventId);
  }
}
