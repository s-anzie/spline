import { Module } from "@nestjs/common";

import { AgentModule } from "../agent/agent.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AdvanceNotificationRecipientUseCase } from "./application/advance-notification-recipient.use-case";
import { GetNotificationUseCase } from "./application/get-notification.use-case";
import { ListNotificationsByWorkspaceUseCase } from "./application/list-notifications-by-workspace.use-case";
import { ListUnreadNotificationsForRecipientUseCase } from "./application/list-unread-notifications-for-recipient.use-case";
import { SendNotificationUseCase } from "./application/send-notification.use-case";
import { NOTIFICATION_RECIPIENT_REPOSITORY } from "./domain/ports/notification-recipient.repository.port";
import { NOTIFICATION_REPOSITORY } from "./domain/ports/notification.repository.port";
import { PrismaNotificationRecipientRepository } from "./infrastructure/prisma-notification-recipient.repository";
import { PrismaNotificationRepository } from "./infrastructure/prisma-notification.repository";
import { NotificationController } from "./interface/notification.controller";
import { UnreadNotificationsController } from "./interface/unread-notifications.controller";

@Module({
  imports: [WorkspaceModule, AgentModule],
  controllers: [NotificationController, UnreadNotificationsController],
  providers: [
    SendNotificationUseCase,
    GetNotificationUseCase,
    ListNotificationsByWorkspaceUseCase,
    AdvanceNotificationRecipientUseCase,
    ListUnreadNotificationsForRecipientUseCase,
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
    { provide: NOTIFICATION_RECIPIENT_REPOSITORY, useClass: PrismaNotificationRecipientRepository },
  ],
})
export class NotificationModule {}
