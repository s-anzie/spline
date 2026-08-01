import { Inject, Injectable } from "@nestjs/common";

import { Notification } from "../domain/notification";
import { NOTIFICATION_REPOSITORY, NotificationRepository } from "../domain/ports/notification.repository.port";

@Injectable()
export class ListNotificationsByWorkspaceUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository) {}

  async execute(workspaceId: string): Promise<Notification[]> {
    return this.notifications.listByWorkspace(workspaceId);
  }
}
