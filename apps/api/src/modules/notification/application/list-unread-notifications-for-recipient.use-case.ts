import { ActorType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Notification } from "../domain/notification";
import { NotificationRecipient } from "../domain/notification-recipient";
import {
  NOTIFICATION_RECIPIENT_REPOSITORY,
  NotificationRecipientRepository,
} from "../domain/ports/notification-recipient.repository.port";
import { NOTIFICATION_REPOSITORY, NotificationRepository } from "../domain/ports/notification.repository.port";

export interface ListUnreadNotificationsForRecipientInput {
  recipientType: ActorType;
  recipientId: string;
}

export interface UnreadNotification {
  notification: Notification;
  recipient: NotificationRecipient;
}

/** Cross-workspace by design (spec 13.2) — deliberately takes no workspaceId. */
@Injectable()
export class ListUnreadNotificationsForRecipientUseCase {
  constructor(
    @Inject(NOTIFICATION_RECIPIENT_REPOSITORY) private readonly recipients: NotificationRecipientRepository,
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
  ) {}

  async execute(input: ListUnreadNotificationsForRecipientInput): Promise<UnreadNotification[]> {
    const unreadRecipients = await this.recipients.listUnreadByRecipient(input.recipientType, input.recipientId);

    const results: UnreadNotification[] = [];
    for (const recipient of unreadRecipients) {
      const notification = await this.notifications.findById(UniqueEntityId.create(recipient.notificationId));
      if (notification) {
        results.push({ notification, recipient });
      }
    }
    return results;
  }
}
