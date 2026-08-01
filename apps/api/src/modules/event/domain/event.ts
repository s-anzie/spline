import { EventSeverity } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { EventRecorded } from "./event-events";
import { EmptyEventTypeError } from "./event.errors";

/**
 * Broader than the strict Prisma ActorType (HUMAN|AGENT) — an Event can also
 * be raised by the system itself (e.g. boot-time reconciliation), so actor is
 * stored as an opaque Json blob rather than the typed actorType/actorId
 * columns used elsewhere (Decision, ResourceLock, Task).
 */
export type EventActorType = "HUMAN" | "AGENT" | "SYSTEM";

export interface EventActorRef {
  type: EventActorType;
  id: string;
}

export interface EventTargetRef {
  type: string;
  id: string;
}

export interface EventProps {
  workspaceId: string;
  type: string;
  severity: EventSeverity;
  actor: EventActorRef;
  target?: EventTargetRef;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface RecordEventProps {
  workspaceId: string;
  type: string;
  severity?: EventSeverity;
  actor: EventActorRef;
  target?: EventTargetRef;
  payload?: Record<string, unknown>;
}

/** A system fact, not a message to acknowledge — no read/ack state lives here (see EventReceipt). */
export class Event extends AggregateRoot<EventProps> {
  static record(props: RecordEventProps, at: Date = new Date(), id?: UniqueEntityId): Event {
    const type = props.type.trim();
    if (!type) {
      throw new EmptyEventTypeError();
    }

    const event = new Event(
      {
        workspaceId: props.workspaceId,
        type,
        severity: props.severity ?? EventSeverity.INFO,
        actor: props.actor,
        target: props.target,
        payload: props.payload ?? {},
        createdAt: at,
      },
      id,
    );
    event.record(new EventRecorded(event.props.workspaceId, event.id.toString(), event.props.type, event.props.severity));
    return event;
  }

  static reconstitute(props: EventProps, id: UniqueEntityId): Event {
    return new Event(props, id);
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get type(): string {
    return this.props.type;
  }

  get severity(): EventSeverity {
    return this.props.severity;
  }

  get actor(): EventActorRef {
    return this.props.actor;
  }

  get target(): EventTargetRef | undefined {
    return this.props.target;
  }

  get payload(): Record<string, unknown> {
    return this.props.payload;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
