import { ActorType, EventReceiptStatus } from "@repo/db";

import { Entity } from "../../../kernel/domain/entity";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { InvalidEventReceiptStatusError } from "./event-receipt.errors";

const STATUS_RANK: Record<EventReceiptStatus, number> = {
  [EventReceiptStatus.SEEN]: 1,
  [EventReceiptStatus.ACKNOWLEDGED]: 2,
  [EventReceiptStatus.ACTED]: 3,
};

export interface Actor {
  type: ActorType;
  id: string;
}

export interface EventReceiptProps {
  eventId: string;
  actorType: ActorType;
  actorId: string;
  status: EventReceiptStatus;
  seenAt?: Date;
  acknowledgedAt?: Date;
  actedAt?: Date;
}

export interface MarkEventReceiptProps {
  eventId: string;
  actor: Actor;
  status: EventReceiptStatus;
}

function stamp(props: EventReceiptProps, status: EventReceiptStatus, at: Date): void {
  props.status = status;
  if (status === EventReceiptStatus.SEEN) {
    props.seenAt = props.seenAt ?? at;
  }
  if (status === EventReceiptStatus.ACKNOWLEDGED) {
    props.acknowledgedAt = at;
  }
  if (status === EventReceiptStatus.ACTED) {
    props.actedAt = at;
  }
}

/**
 * An actor's acknowledgement of an Event — deliberately NOT an AggregateRoot:
 * it has no workspaceId of its own (per spec) so it has nothing to emit a
 * DomainEvent against, same precedent as RuntimeCommand.
 */
export class EventReceipt extends Entity<EventReceiptProps> {
  static mark(props: MarkEventReceiptProps, at: Date = new Date(), id?: UniqueEntityId): EventReceipt {
    if (!Object.values(EventReceiptStatus).includes(props.status)) {
      throw new InvalidEventReceiptStatusError(String(props.status));
    }

    const receiptProps: EventReceiptProps = {
      eventId: props.eventId,
      actorType: props.actor.type,
      actorId: props.actor.id,
      status: props.status,
    };
    stamp(receiptProps, props.status, at);
    return new EventReceipt(receiptProps, id);
  }

  static reconstitute(props: EventReceiptProps, id: UniqueEntityId): EventReceipt {
    return new EventReceipt(props, id);
  }

  get eventId(): string {
    return this.props.eventId;
  }

  get actorType(): ActorType {
    return this.props.actorType;
  }

  get actorId(): string {
    return this.props.actorId;
  }

  get status(): EventReceiptStatus {
    return this.props.status;
  }

  get seenAt(): Date | undefined {
    return this.props.seenAt;
  }

  get acknowledgedAt(): Date | undefined {
    return this.props.acknowledgedAt;
  }

  get actedAt(): Date | undefined {
    return this.props.actedAt;
  }

  /** Forward-only: advancing to the current or an earlier status is a no-op — a receipt never regresses. */
  advanceTo(status: EventReceiptStatus, at: Date = new Date()): void {
    if (STATUS_RANK[status] <= STATUS_RANK[this.props.status]) {
      return;
    }
    stamp(this.props, status, at);
  }
}
