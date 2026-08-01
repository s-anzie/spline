import { ActorType } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { EventReceipt } from "../../domain/event-receipt";
import { EventReceiptRepository } from "../../domain/ports/event-receipt.repository.port";

export class InMemoryEventReceiptRepository implements EventReceiptRepository {
  private readonly receipts = new Map<string, EventReceipt>();

  async save(receipt: EventReceipt): Promise<void> {
    this.receipts.set(receipt.id.toString(), receipt);
  }

  async findById(id: UniqueEntityId): Promise<EventReceipt | null> {
    return this.receipts.get(id.toString()) ?? null;
  }

  async findByEventAndActor(eventId: string, actorType: ActorType, actorId: string): Promise<EventReceipt | null> {
    return (
      [...this.receipts.values()].find(
        (r) => r.eventId === eventId && r.actorType === actorType && r.actorId === actorId,
      ) ?? null
    );
  }

  async listByEvent(eventId: string): Promise<EventReceipt[]> {
    return [...this.receipts.values()].filter((r) => r.eventId === eventId);
  }
}
