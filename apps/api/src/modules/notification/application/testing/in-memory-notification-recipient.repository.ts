import { ActorType } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { NotificationRecipient } from "../../domain/notification-recipient";
import { NotificationRecipientRepository } from "../../domain/ports/notification-recipient.repository.port";

export class InMemoryNotificationRecipientRepository implements NotificationRecipientRepository {
  private readonly recipients = new Map<string, NotificationRecipient>();

  async save(recipient: NotificationRecipient): Promise<void> {
    this.recipients.set(recipient.id.toString(), recipient);
  }

  async findById(id: UniqueEntityId): Promise<NotificationRecipient | null> {
    return this.recipients.get(id.toString()) ?? null;
  }

  async findByNotificationAndRecipient(
    notificationId: string,
    recipientType: ActorType,
    recipientId: string,
  ): Promise<NotificationRecipient | null> {
    return (
      [...this.recipients.values()].find(
        (r) =>
          r.notificationId === notificationId && r.recipientType === recipientType && r.recipientId === recipientId,
      ) ?? null
    );
  }

  async listByNotification(notificationId: string): Promise<NotificationRecipient[]> {
    return [...this.recipients.values()].filter((r) => r.notificationId === notificationId);
  }

  async listUnreadByRecipient(recipientType: ActorType, recipientId: string): Promise<NotificationRecipient[]> {
    return [...this.recipients.values()].filter(
      (r) => r.recipientType === recipientType && r.recipientId === recipientId && !r.readAt,
    );
  }
}
