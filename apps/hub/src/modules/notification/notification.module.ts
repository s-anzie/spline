import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { TaskModule } from "../task/task.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AlertOnLeaseExpiredListener } from "./application/alert-on-lease-expired.listener";
import { AlertOnPolicyViolatedListener } from "./application/alert-on-policy-violated.listener";
import { AlertOnValidationFailedListener } from "./application/alert-on-validation-failed.listener";
import { AdvanceRecipientUseCase } from "./application/advance-recipient.use-case";
import { ListNotificationsUseCase } from "./application/list-notifications.use-case";
import { ListUnreadUseCase } from "./application/list-unread.use-case";
import { NotifyAssigneeOnTaskAssignedListener } from "./application/notify-assignee.listener";
import { SendNotificationUseCase } from "./application/send-notification.use-case";
import {
  NOTIFICATION_RECIPIENT_REPOSITORY,
  NOTIFICATION_REPOSITORY,
} from "./domain/ports/notification.repository.port";
import {
  PrismaNotificationRecipientRepository,
  PrismaNotificationRepository,
} from "./infrastructure/prisma-notification.repository";
import { NotificationController } from "./interface/notification.controller";

/**
 * Imports IdentityModule for WORKSPACE_AUDIENCE (the broadcast fan-out) and
 * for the guards; TaskModule to validate the thread anchor. No cycle: neither
 * identity nor task knows this module exists — the one reaction it has to a
 * task fact goes through the event bus.
 */
@Module({
  imports: [IdentityModule, WorkspaceModule, TaskModule],
  controllers: [NotificationController],
  providers: [
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
    {
      provide: NOTIFICATION_RECIPIENT_REPOSITORY,
      useClass: PrismaNotificationRecipientRepository,
    },
    SendNotificationUseCase,
    ListNotificationsUseCase,
    ListUnreadUseCase,
    AdvanceRecipientUseCase,
    NotifyAssigneeOnTaskAssignedListener,
    AlertOnValidationFailedListener,
    AlertOnPolicyViolatedListener,
    AlertOnLeaseExpiredListener,
  ],
  exports: [SendNotificationUseCase],
})
export class NotificationModule {}
