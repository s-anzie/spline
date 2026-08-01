import { NotificationRecipient as PrismaNotificationRecipient } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { NotificationRecipient } from "../domain/notification-recipient";

export interface NotificationRecipientPersistenceData {
  id: string;
  notificationId: string;
  recipientType: PrismaNotificationRecipient["recipientType"];
  recipientId: string;
  deliveryStatus: PrismaNotificationRecipient["deliveryStatus"];
  deliveredAt: Date | null;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  actionTakenAt: Date | null;
  lastSeenAt: Date | null;
  failureReason: string | null;
}

export class NotificationRecipientMapper {
  static toDomain(record: PrismaNotificationRecipient): NotificationRecipient {
    return NotificationRecipient.reconstitute(
      {
        notificationId: record.notificationId,
        recipientType: record.recipientType,
        recipientId: record.recipientId,
        deliveryStatus: record.deliveryStatus,
        deliveredAt: record.deliveredAt ?? undefined,
        readAt: record.readAt ?? undefined,
        acknowledgedAt: record.acknowledgedAt ?? undefined,
        actionTakenAt: record.actionTakenAt ?? undefined,
        lastSeenAt: record.lastSeenAt ?? undefined,
        failureReason: record.failureReason ?? undefined,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(recipient: NotificationRecipient): NotificationRecipientPersistenceData {
    return {
      id: recipient.id.toString(),
      notificationId: recipient.notificationId,
      recipientType: recipient.recipientType,
      recipientId: recipient.recipientId,
      deliveryStatus: recipient.deliveryStatus,
      deliveredAt: recipient.deliveredAt ?? null,
      readAt: recipient.readAt ?? null,
      acknowledgedAt: recipient.acknowledgedAt ?? null,
      actionTakenAt: recipient.actionTakenAt ?? null,
      lastSeenAt: recipient.lastSeenAt ?? null,
      failureReason: recipient.failureReason ?? null,
    };
  }
}
