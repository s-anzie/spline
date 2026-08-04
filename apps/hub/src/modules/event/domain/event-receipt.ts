import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

export const RECEIPT_STATUSES = [
  "PENDING",
  "SEEN",
  "ACKNOWLEDGED",
  "ACTED",
] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

/** Strictly forward: nobody acted on what they never acknowledged. */
const STATUS_MACHINE = new StateMachine<ReceiptStatus>({
  PENDING: ["SEEN"],
  SEEN: ["ACKNOWLEDGED"],
  ACKNOWLEDGED: ["ACTED"],
  ACTED: [],
});

export class EventReceiptRequired extends BaseDomainEvent {
  readonly eventName = "event.receipt_required";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly eventId: string,
    readonly actor: ActorRef,
  ) {
    super(aggregateId, occurredAt, null);
  }
}

export class EventReceiptAdvanced extends BaseDomainEvent {
  readonly eventName = "event.receipt_advanced";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly eventId: string,
    readonly status: ReceiptStatus,
  ) {
    super(aggregateId, occurredAt, null);
  }
}

interface ReceiptProps {
  eventId: string;
  actor: ActorRef;
  status: ReceiptStatus;
  seenAt: Date | null;
  acknowledgedAt: Date | null;
  actedAt: Date | null;
  createdAt: Date;
}

export interface RequireReceiptProps {
  eventId: string;
  actor: ActorRef;
  now: Date;
}

/**
 * §4.21 — one actor taking notice of one fact. Separate from Event on
 * purpose: a fact is shared, noticing it is individual (§14.4).
 */
export class EventReceipt extends AggregateRoot<ReceiptProps> {
  static require(
    input: RequireReceiptProps,
    id?: UniqueEntityId,
  ): Result<EventReceipt, never> {
    const receipt = new EventReceipt(
      {
        eventId: input.eventId,
        actor: input.actor,
        status: "PENDING",
        seenAt: null,
        acknowledgedAt: null,
        actedAt: null,
        createdAt: input.now,
      },
      id,
    );
    receipt.addDomainEvent(
      new EventReceiptRequired(receipt.id.value, input.now, input.eventId, input.actor),
    );
    return Result.ok(receipt);
  }

  static reconstitute(props: ReceiptProps, id: string): EventReceipt {
    return new EventReceipt(props, new UniqueEntityId(id));
  }

  get eventId(): string {
    return this.props.eventId;
  }

  get actor(): ActorRef {
    return this.props.actor;
  }

  get status(): ReceiptStatus {
    return this.props.status;
  }

  get seenAt(): Date | null {
    return this.props.seenAt;
  }

  get acknowledgedAt(): Date | null {
    return this.props.acknowledgedAt;
  }

  get actedAt(): Date | null {
    return this.props.actedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** §22.6 semantics; each step stamps its own timestamp, once. */
  advanceTo(
    next: ReceiptStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("EventReceipt", outcome));
      case "transitioned": {
        this.props.status = outcome.to;
        if (outcome.to === "SEEN") this.props.seenAt = now;
        if (outcome.to === "ACKNOWLEDGED") this.props.acknowledgedAt = now;
        if (outcome.to === "ACTED") this.props.actedAt = now;
        this.addDomainEvent(
          new EventReceiptAdvanced(this.id.value, now, this.props.eventId, outcome.to),
        );
        return Result.ok(undefined);
      }
    }
  }

  allowedStatusTargets(): readonly ReceiptStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }
}
