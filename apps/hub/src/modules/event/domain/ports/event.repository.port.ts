import { ActorRef } from "../../../identity/domain/actor";
import { Event } from "../event";
import { EventReceipt, ReceiptStatus } from "../event-receipt";
import { EventSeverity } from "../event-severity";

export interface ListEventsFilter {
  workspaceId?: string | null;
  type?: string;
  severities?: readonly EventSeverity[];
  targetType?: string;
  targetId?: string;
  actor?: ActorRef;
  /** Replay (§14.5) reads forward from a known position. */
  afterSequence?: bigint;
  limit?: number;
}

export interface EventRepository {
  /** Appends and returns the fact with the sequence the store assigned. */
  append(event: Event): Promise<Event>;
  findById(id: string): Promise<Event | null>;
  list(filter: ListEventsFilter): Promise<Event[]>;
}
export const EVENT_REPOSITORY = "event/EventRepository";

export interface ListReceiptsFilter {
  actor: ActorRef;
  statuses?: readonly ReceiptStatus[];
}

export interface EventReceiptRepository {
  save(receipt: EventReceipt): Promise<void>;
  findById(id: string): Promise<EventReceipt | null>;
  findByEventAndActor(eventId: string, actor: ActorRef): Promise<EventReceipt | null>;
  list(filter: ListReceiptsFilter): Promise<EventReceipt[]>;
}
export const EVENT_RECEIPT_REPOSITORY = "event/EventReceiptRepository";
