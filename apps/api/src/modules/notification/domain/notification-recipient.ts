import { ActorType, NotificationDeliveryStatus } from "@repo/db";

import { Entity } from "../../../kernel/domain/entity";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";

const STATUS_RANK: Record<NotificationDeliveryStatus, number> = {
  [NotificationDeliveryStatus.PENDING]: 1,
  [NotificationDeliveryStatus.DELIVERED]: 2,
  [NotificationDeliveryStatus.SEEN]: 3,
  [NotificationDeliveryStatus.ACKNOWLEDGED]: 4,
  [NotificationDeliveryStatus.ACTED_ON]: 5,
  [NotificationDeliveryStatus.FAILED]: -1,
};

export interface Recipient {
  type: ActorType;
  id: string;
}

export interface NotificationRecipientProps {
  notificationId: string;
  recipientType: ActorType;
  recipientId: string;
  deliveryStatus: NotificationDeliveryStatus;
  deliveredAt?: Date;
  readAt?: Date;
  acknowledgedAt?: Date;
  actionTakenAt?: Date;
  lastSeenAt?: Date;
  failureReason?: string;
}

export interface ResolveNotificationRecipientProps {
  notificationId: string;
  recipient: Recipient;
}

/**
 * One row per actual recipient, resolved immediately when the Notification
 * is sent (see spec 13.1) — never a `to: all` string reinterpreted at read
 * time. Deliberately NOT an AggregateRoot: state changes here (a recipient
 * marking their own copy read/acknowledged) aren't broadcast-worthy the way
 * NotificationSent is.
 */
export class NotificationRecipient extends Entity<NotificationRecipientProps> {
  static resolve(props: ResolveNotificationRecipientProps, id?: UniqueEntityId): NotificationRecipient {
    return new NotificationRecipient(
      {
        notificationId: props.notificationId,
        recipientType: props.recipient.type,
        recipientId: props.recipient.id,
        deliveryStatus: NotificationDeliveryStatus.PENDING,
      },
      id,
    );
  }

  static reconstitute(props: NotificationRecipientProps, id: UniqueEntityId): NotificationRecipient {
    return new NotificationRecipient(props, id);
  }

  get notificationId(): string {
    return this.props.notificationId;
  }

  get recipientType(): ActorType {
    return this.props.recipientType;
  }

  get recipientId(): string {
    return this.props.recipientId;
  }

  get deliveryStatus(): NotificationDeliveryStatus {
    return this.props.deliveryStatus;
  }

  get deliveredAt(): Date | undefined {
    return this.props.deliveredAt;
  }

  get readAt(): Date | undefined {
    return this.props.readAt;
  }

  get acknowledgedAt(): Date | undefined {
    return this.props.acknowledgedAt;
  }

  get actionTakenAt(): Date | undefined {
    return this.props.actionTakenAt;
  }

  get lastSeenAt(): Date | undefined {
    return this.props.lastSeenAt;
  }

  get failureReason(): string | undefined {
    return this.props.failureReason;
  }

  /** Forward-only, skip-ahead allowed (e.g. delivery can race behind an immediate read). Never regresses. */
  advanceTo(status: NotificationDeliveryStatus, at: Date = new Date()): void {
    if (status === NotificationDeliveryStatus.SEEN || STATUS_RANK[status] >= STATUS_RANK[NotificationDeliveryStatus.SEEN]) {
      this.props.lastSeenAt = at;
    }
    if (STATUS_RANK[status] <= STATUS_RANK[this.props.deliveryStatus]) {
      return;
    }
    this.props.deliveryStatus = status;
    if (STATUS_RANK[status] >= STATUS_RANK[NotificationDeliveryStatus.DELIVERED]) {
      this.props.deliveredAt = this.props.deliveredAt ?? at;
    }
    if (STATUS_RANK[status] >= STATUS_RANK[NotificationDeliveryStatus.SEEN]) {
      this.props.readAt = this.props.readAt ?? at;
    }
    if (STATUS_RANK[status] >= STATUS_RANK[NotificationDeliveryStatus.ACKNOWLEDGED]) {
      this.props.acknowledgedAt = this.props.acknowledgedAt ?? at;
    }
    if (STATUS_RANK[status] >= STATUS_RANK[NotificationDeliveryStatus.ACTED_ON]) {
      this.props.actionTakenAt = this.props.actionTakenAt ?? at;
    }
  }

  /** Only meaningful before the recipient has engaged — once SEEN or further, failure no longer makes sense. */
  fail(reason: string): void {
    if (this.props.deliveryStatus === NotificationDeliveryStatus.FAILED) {
      return;
    }
    if (STATUS_RANK[this.props.deliveryStatus] >= STATUS_RANK[NotificationDeliveryStatus.SEEN]) {
      return;
    }
    this.props.deliveryStatus = NotificationDeliveryStatus.FAILED;
    this.props.failureReason = reason;
  }
}
