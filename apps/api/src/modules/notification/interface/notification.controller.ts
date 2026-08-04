import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Inject, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";

import {
  AuthenticatedRequester,
  CurrentRequester,
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface";
import { DomainError } from "../../../kernel/domain/domain-error";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { AdvanceNotificationRecipientUseCase } from "../application/advance-notification-recipient.use-case";
import { GetNotificationUseCase } from "../application/get-notification.use-case";
import { ListNotificationsByWorkspaceUseCase } from "../application/list-notifications-by-workspace.use-case";
import {
  EmptyDirectRecipientsError,
  NotificationNotFoundError,
  NotificationRecipientNotFoundError,
} from "../application/notification-application.errors";
import { SendNotificationUseCase } from "../application/send-notification.use-case";
import { Notification } from "../domain/notification";
import { NotificationRecipient } from "../domain/notification-recipient";
import { EmptyNotificationBodyError } from "../domain/notification.errors";
import { AdvanceNotificationRecipientDto } from "./dto/advance-notification-recipient.dto";
import { SendNotificationDto } from "./dto/send-notification.dto";
import {
  NOTIFICATION_RECIPIENT_REPOSITORY,
  NotificationRecipientRepository,
} from "../domain/ports/notification-recipient.repository.port";

function toNotificationResponse(notification: Notification) {
  return {
    id: notification.id.toString(),
    workspaceId: notification.workspaceId,
    kind: notification.kind,
    scope: notification.scope,
    taskId: notification.taskId ?? null,
    title: notification.title ?? null,
    body: notification.body,
    payload: notification.payload,
    linkedEventId: notification.linkedEventId ?? null,
    createdBy: notification.createdBy,
    createdAt: notification.createdAt.toISOString(),
  };
}

function toRecipientResponse(recipient: NotificationRecipient) {
  return {
    id: recipient.id.toString(),
    notificationId: recipient.notificationId,
    recipientType: recipient.recipientType,
    recipientId: recipient.recipientId,
    deliveryStatus: recipient.deliveryStatus,
    deliveredAt: recipient.deliveredAt?.toISOString() ?? null,
    readAt: recipient.readAt?.toISOString() ?? null,
    acknowledgedAt: recipient.acknowledgedAt?.toISOString() ?? null,
    actionTakenAt: recipient.actionTakenAt?.toISOString() ?? null,
    lastSeenAt: recipient.lastSeenAt?.toISOString() ?? null,
    failureReason: recipient.failureReason ?? null,
  };
}

function toHttpError(error: DomainError): Error {
  if (
    error instanceof WorkspaceNotFoundError ||
    error instanceof NotificationNotFoundError ||
    error instanceof NotificationRecipientNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  if (error instanceof EmptyNotificationBodyError || error instanceof EmptyDirectRecipientsError) {
    return new BadRequestException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/notifications")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationController {
  constructor(
    private readonly sendNotificationUseCase: SendNotificationUseCase,
    private readonly getNotificationUseCase: GetNotificationUseCase,
    private readonly listNotificationsByWorkspaceUseCase: ListNotificationsByWorkspaceUseCase,
    private readonly advanceNotificationRecipientUseCase: AdvanceNotificationRecipientUseCase,
    @Inject(NOTIFICATION_RECIPIENT_REPOSITORY)
    private readonly notificationRecipients: NotificationRecipientRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async send(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: SendNotificationDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.sendNotificationUseCase.execute({
      workspaceId,
      kind: dto.kind,
      scope: dto.scope,
      taskId: dto.taskId,
      title: dto.title,
      body: dto.body,
      payload: dto.payload,
      linkedEventId: dto.linkedEventId,
      createdBy: { type: requester.type, id: requester.id },
      recipients: dto.recipients,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return {
      notification: toNotificationResponse(result.value.notification),
      recipients: result.value.recipients.map(toRecipientResponse),
    };
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string) {
    const notifications = await this.listNotificationsByWorkspaceUseCase.execute(workspaceId);
    return Promise.all(
      notifications.map(async (notification) => ({
        ...toNotificationResponse(notification),
        recipients: (
          await this.notificationRecipients.listByNotification(
            notification.id.toString(),
          )
        ).map(toRecipientResponse),
      })),
    );
  }

  @Get(":notificationId")
  @RequirePermission("read_tasks")
  async get(@Param("notificationId") notificationId: string) {
    const result = await this.getNotificationUseCase.execute(notificationId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toNotificationResponse(result.value);
  }

  @Post(":notificationId/advance")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("read_tasks")
  async advance(
    @Param("notificationId") notificationId: string,
    @Body() dto: AdvanceNotificationRecipientDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.advanceNotificationRecipientUseCase.execute({
      notificationId,
      actor: { type: requester.type, id: requester.id },
      status: dto.status,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toRecipientResponse(result.value);
  }
}
