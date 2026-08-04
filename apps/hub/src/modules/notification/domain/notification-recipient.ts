import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

export const DELIVERY_STATUSES = [
  "PENDING",
  "DELIVERED",
  "SEEN",
  "ACKNOWLEDGED",
  "ACTED_ON",
  "FAILED",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * Monotone, but not uniformly strict — the distinction is real. DELIVERED is
 * a fact of the *transport*; SEEN, ACKNOWLEDGED and ACTED_ON are declarations
 * of the *recipient*. Someone who polls their own unread list (§10.4) was
 * never pushed to, so PENDING → SEEN must be allowed: forcing them through
 * DELIVERED would make them state something untrue. ACTED_ON without
 * ACKNOWLEDGED stays refused — nobody acts on what they never acknowledged.
 *
 * FAILED is reachable from PENDING alone: a delivery failure never buries a
 * message that has already been read.
 */
const DELIVERY_MACHINE = new StateMachine<DeliveryStatus>({
  PENDING: ["DELIVERED", "SEEN", "FAILED"],
  DELIVERED: ["SEEN"],
  SEEN: ["ACKNOWLEDGED"],
  ACKNOWLEDGED: ["ACTED_ON"],
  ACTED_ON: [],
  FAILED: [],
});

/** Anything the recipient has not laid eyes on yet, failures included. */
const UNREAD: readonly DeliveryStatus[] = ["PENDING", "DELIVERED", "FAILED"];

export class NotificationAddressed extends BaseDomainEvent {
  readonly eventName = "notification.addressed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string | null,
    readonly notificationId: string,
    readonly recipient: ActorRef,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class NotificationRecipientAdvanced extends BaseDomainEvent {
  readonly eventName = "notification.recipient_advanced";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string | null,
    readonly notificationId: string,
    readonly status: DeliveryStatus,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface RecipientProps {
  notificationId: string;
  recipient: ActorRef;
  deliveryStatus: DeliveryStatus;
  deliveredAt: Date | null;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  actionTakenAt: Date | null;
  lastSeenAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface AddressRecipientProps {
  notificationId: string;
  recipient: ActorRef;
  now: Date;
  /** Carried only so the emitted facts can be filtered per workspace (§4.20). */
  workspaceId?: string | null;
}

/**
 * §4.19 — one row per real recipient, generated when the notification is
 * created, never recomputed at read time. Without it, `ack` on a broadcast
 * has no individual meaning; that is exactly what broke in production with
 * the previous tool, and why v3 restores this entity.
 */
export class NotificationRecipient extends AggregateRoot<RecipientProps> {
  private workspaceId: string | null = null;

  static address(
    input: AddressRecipientProps,
    id?: UniqueEntityId,
  ): Result<NotificationRecipient, never> {
    const recipient = new NotificationRecipient(
      {
        notificationId: input.notificationId,
        recipient: input.recipient,
        deliveryStatus: "PENDING",
        deliveredAt: null,
        readAt: null,
        acknowledgedAt: null,
        actionTakenAt: null,
        lastSeenAt: null,
        failureReason: null,
        createdAt: input.now,
      },
      id,
    );
    recipient.workspaceId = input.workspaceId ?? null;
    recipient.addDomainEvent(
      new NotificationAddressed(
        recipient.id.value,
        input.now,
        recipient.workspaceId,
        input.notificationId,
        input.recipient,
      ),
    );
    return Result.ok(recipient);
  }

  static reconstitute(
    props: RecipientProps,
    id: string,
    workspaceId?: string | null,
  ): NotificationRecipient {
    const recipient = new NotificationRecipient(props, new UniqueEntityId(id));
    recipient.workspaceId = workspaceId ?? null;
    return recipient;
  }

  get notificationId(): string {
    return this.props.notificationId;
  }

  get recipient(): ActorRef {
    return this.props.recipient;
  }

  get deliveryStatus(): DeliveryStatus {
    return this.props.deliveryStatus;
  }

  get deliveredAt(): Date | null {
    return this.props.deliveredAt;
  }

  get readAt(): Date | null {
    return this.props.readAt;
  }

  get acknowledgedAt(): Date | null {
    return this.props.acknowledgedAt;
  }

  get actionTakenAt(): Date | null {
    return this.props.actionTakenAt;
  }

  get lastSeenAt(): Date | null {
    return this.props.lastSeenAt;
  }

  get failureReason(): string | null {
    return this.props.failureReason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** The whole point of §4.19: read state is individual, never derived. */
  get isUnread(): boolean {
    return UNREAD.includes(this.props.deliveryStatus);
  }

  /** §22.6 semantics; each step stamps its own timestamp, once. */
  advanceTo(
    next: DeliveryStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = DELIVERY_MACHINE.transition(this.props.deliveryStatus, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(
          new InvalidStateTransitionError("NotificationRecipient", outcome),
        );
      case "transitioned": {
        this.props.deliveryStatus = outcome.to;
        this.props.lastSeenAt = now;
        if (outcome.to === "DELIVERED") this.props.deliveredAt = now;
        if (outcome.to === "SEEN") this.props.readAt = now;
        if (outcome.to === "ACKNOWLEDGED") this.props.acknowledgedAt = now;
        if (outcome.to === "ACTED_ON") this.props.actionTakenAt = now;
        this.addDomainEvent(
          new NotificationRecipientAdvanced(
            this.id.value,
            now,
            this.workspaceId,
            this.props.notificationId,
            outcome.to,
          ),
        );
        return Result.ok(undefined);
      }
    }
  }

  /** Delivery gave up. Refused once the message has been read (§1.6). */
  fail(reason: string, now: Date): Result<void, InvalidStateTransitionError> {
    const advanced = this.advanceTo("FAILED", now);
    if (advanced.isSuccess) {
      this.props.failureReason = reason;
    }
    return advanced;
  }

  allowedStatusTargets(): readonly DeliveryStatus[] {
    return DELIVERY_MACHINE.allowedFrom(this.props.deliveryStatus);
  }
}
