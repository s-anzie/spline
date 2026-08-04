import { ActorRef } from "../../../identity/domain/actor";
import { Event } from "../../domain/event";
import { EventReceipt } from "../../domain/event-receipt";
import {
  EventReceiptRepository,
  EventRepository,
  ListEventsFilter,
  ListReceiptsFilter,
} from "../../domain/ports/event.repository.port";

export class InMemoryEventRepository implements EventRepository {
  readonly events: Event[] = [];
  private next = 1n;

  async append(event: Event): Promise<Event> {
    const stored = Event.reconstitute(
      {
        workspaceId: event.workspaceId,
        type: event.type,
        severity: event.severity,
        actor: event.actor,
        targetType: event.targetType,
        targetId: event.targetId,
        payload: event.payload,
        sequence: this.next++,
        createdAt: event.createdAt,
      },
      event.id.value,
    );
    this.events.push(stored);
    return stored;
  }

  async findById(id: string): Promise<Event | null> {
    return this.events.find((event) => event.id.value === id) ?? null;
  }

  async list(filter: ListEventsFilter): Promise<Event[]> {
    return this.events
      .filter((event) => {
        if (filter.workspaceId !== undefined && event.workspaceId !== filter.workspaceId) {
          return false;
        }
        if (filter.type !== undefined && event.type !== filter.type) return false;
        if (filter.severities && !filter.severities.includes(event.severity)) return false;
        if (filter.targetType !== undefined && event.targetType !== filter.targetType) {
          return false;
        }
        if (filter.targetId !== undefined && event.targetId !== filter.targetId) return false;
        if (filter.actor && !event.actor?.equals(filter.actor)) return false;
        if (filter.afterSequence !== undefined && event.sequence <= filter.afterSequence) {
          return false;
        }
        return true;
      })
      .sort((a, b) => Number(a.sequence - b.sequence))
      .slice(0, filter.limit);
  }
}

export class InMemoryEventReceiptRepository implements EventReceiptRepository {
  readonly receipts = new Map<string, EventReceipt>();

  async save(receipt: EventReceipt): Promise<void> {
    this.receipts.set(receipt.id.value, receipt);
  }

  async findById(id: string): Promise<EventReceipt | null> {
    return this.receipts.get(id) ?? null;
  }

  async findByEventAndActor(
    eventId: string,
    actor: ActorRef,
  ): Promise<EventReceipt | null> {
    for (const receipt of this.receipts.values()) {
      if (receipt.eventId === eventId && receipt.actor.equals(actor)) return receipt;
    }
    return null;
  }

  async list(filter: ListReceiptsFilter): Promise<EventReceipt[]> {
    return [...this.receipts.values()].filter((receipt) => {
      if (!receipt.actor.equals(filter.actor)) return false;
      if (filter.statuses && !filter.statuses.includes(receipt.status)) return false;
      return true;
    });
  }
}
