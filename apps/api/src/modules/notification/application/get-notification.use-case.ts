import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Notification } from "../domain/notification";
import { NOTIFICATION_REPOSITORY, NotificationRepository } from "../domain/ports/notification.repository.port";
import { NotificationNotFoundError } from "./notification-application.errors";

@Injectable()
export class GetNotificationUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository) {}

  async execute(notificationId: string): Promise<Result<Notification, NotificationNotFoundError>> {
    const notification = await this.notifications.findById(UniqueEntityId.create(notificationId));
    if (!notification) {
      return Result.fail(new NotificationNotFoundError(notificationId));
    }
    return Result.ok(notification);
  }
}
