import { ActorType } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { NotificationRecipient } from "../notification-recipient";

export const NOTIFICATION_RECIPIENT_REPOSITORY = Symbol("NOTIFICATION_RECIPIENT_REPOSITORY");

export interface NotificationRecipientRepository {
  save(recipient: NotificationRecipient): Promise<void>;
  findById(id: UniqueEntityId): Promise<NotificationRecipient | null>;
  findByNotificationAndRecipient(
    notificationId: string,
    recipientType: ActorType,
    recipientId: string,
  ): Promise<NotificationRecipient | null>;
  listByNotification(notificationId: string): Promise<NotificationRecipient[]>;
  /** Cross-workspace by design (spec 13.2) — no workspaceId filter here. */
  listUnreadByRecipient(recipientType: ActorType, recipientId: string): Promise<NotificationRecipient[]>;
}
