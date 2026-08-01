import { ActorType } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { EventReceipt } from "../event-receipt";

export const EVENT_RECEIPT_REPOSITORY = Symbol("EVENT_RECEIPT_REPOSITORY");

export interface EventReceiptRepository {
  save(receipt: EventReceipt): Promise<void>;
  findById(id: UniqueEntityId): Promise<EventReceipt | null>;
  findByEventAndActor(eventId: string, actorType: ActorType, actorId: string): Promise<EventReceipt | null>;
  listByEvent(eventId: string): Promise<EventReceipt[]>;
}
