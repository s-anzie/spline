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
  /** Omitted means DEFAULT_EVENT_PAGE, never "everything" — see below. */
  limit?: number;
}

/**
 * A journal grows without bound — §14.1 keeps every fact and no retention
 * policy exists yet (that is the Policy Engine's, §12). So an unfiltered read
 * has to be capped by default: `GET …/events` with no parameter returned the
 * entire journal of a workspace, which is fine on day one and a way to take
 * the hub down on day one hundred. Replay pages forward with `afterSequence`
 * (§14.5), so a cap costs nothing that ordering does not already provide.
 */
export const DEFAULT_EVENT_PAGE = 100;
export const MAX_EVENT_PAGE = 500;

export interface EventRepository {
  /** Appends and returns the fact with the sequence the store assigned. */
  append(event: Event): Promise<Event>;
  findById(id: string): Promise<Event | null>;
  list(filter: ListEventsFilter): Promise<Event[]>;
}
export const EVENT_REPOSITORY = "event/EventRepository";

export interface ListReceiptsFilter {
  /**
   * Mandatory (§4.2, §20.4). Scoping to the actor alone is NOT isolation: an
   * actor who belongs to two workspaces would get one list mixing both, and
   * would keep seeing a workspace after losing access to it. Receipts have no
   * workspace of their own — they inherit the one of the fact they answer to.
   */
  workspaceId: string;
  actor: ActorRef;
  statuses?: readonly ReceiptStatus[];
}

export interface EventReceiptRepository {
  save(receipt: EventReceipt): Promise<void>;
  findById(id: string): Promise<EventReceipt | null>;
  /**
   * `workspaceId` is part of the lookup, not a courtesy: without it the
   * workspace in a route is decorative — the guard checks membership of one
   * workspace while the receipt acted upon belongs to another (§4.2).
   */
  findByEventAndActor(
    workspaceId: string,
    eventId: string,
    actor: ActorRef,
  ): Promise<EventReceipt | null>;
  list(filter: ListReceiptsFilter): Promise<EventReceipt[]>;
}
export const EVENT_RECEIPT_REPOSITORY = "event/EventReceiptRepository";
