import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { Notification } from "../domain/notification";
import { NotificationNotFoundError } from "../domain/notification.errors";
import {
  ListNotificationsFilter,
  NOTIFICATION_REPOSITORY,
  NotificationRepository,
} from "../domain/ports/notification.repository.port";

/** The addressed record of one workspace — never of several (§4.2). */
@Injectable()
export class ListNotificationsUseCase
  implements UseCase<ListNotificationsFilter, Result<Notification[], GuardViolation>>
{
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
  ) {}

  async execute(
    filter: ListNotificationsFilter,
  ): Promise<Result<Notification[], GuardViolation>> {
    const workspaceId = Guard.againstEmpty(filter.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    return Result.ok(
      await this.notifications.list({ ...filter, workspaceId: workspaceId.value }),
    );
  }
}

/** Sending returns a `notificationId`; following it up must be possible. */
@Injectable()
export class GetNotificationUseCase
  implements
    UseCase<
      { workspaceId: string; notificationId: string },
      Result<Notification, NotificationNotFoundError>
    >
{
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
  ) {}

  async execute(input: {
    workspaceId: string;
    notificationId: string;
  }): Promise<Result<Notification, NotificationNotFoundError>> {
    const notification = await this.notifications.findById(input.notificationId);
    if (!notification || notification.workspaceId !== input.workspaceId) {
      return Result.fail(new NotificationNotFoundError(input.notificationId));
    }
    return Result.ok(notification);
  }
}
