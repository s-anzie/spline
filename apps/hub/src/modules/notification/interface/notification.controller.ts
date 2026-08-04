import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { AdvanceRecipientUseCase } from "../application/advance-recipient.use-case";
import {
  GetNotificationUseCase,
  ListNotificationsUseCase,
} from "../application/list-notifications.use-case";
import { ListUnreadUseCase } from "../application/list-unread.use-case";
import { SendNotificationUseCase } from "../application/send-notification.use-case";
import { NotificationRecipient } from "../domain/notification-recipient";
import { Notification } from "../domain/notification";
import {
  AdvanceRecipientDto,
  ListNotificationsQueryDto,
  SendNotificationDto,
} from "./dto/notification.dtos";

function toView(notification: Notification) {
  return {
    id: notification.id.value,
    workspaceId: notification.workspaceId,
    kind: notification.kind,
    scope: notification.scope,
    taskId: notification.taskId,
    from: notification.fromActor
      ? { type: notification.fromActor.type, id: notification.fromActor.actorId }
      : null,
    title: notification.title,
    body: notification.body,
    payload: notification.payload,
    createdBy: {
      type: notification.createdBy.type,
      id: notification.createdBy.actorId,
    },
    createdAt: notification.createdAt.toISOString(),
  };
}

function toRecipientView(recipient: NotificationRecipient, notification: Notification) {
  return {
    id: recipient.id.value,
    notificationId: recipient.notificationId,
    deliveryStatus: recipient.deliveryStatus,
    deliveredAt: recipient.deliveredAt?.toISOString() ?? null,
    readAt: recipient.readAt?.toISOString() ?? null,
    acknowledgedAt: recipient.acknowledgedAt?.toISOString() ?? null,
    actionTakenAt: recipient.actionTakenAt?.toISOString() ?? null,
    failureReason: recipient.failureReason,
    /** §20.6 — the affordances, before the caller hits a refusal. */
    allowedStatusTargets: recipient.allowedStatusTargets(),
    notification: toView(notification),
  };
}

@Controller("workspaces/:workspaceId/notifications")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class NotificationController {
  constructor(
    private readonly send: SendNotificationUseCase,
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly getNotification: GetNotificationUseCase,
    private readonly listUnread: ListUnreadUseCase,
    private readonly advance: AdvanceRecipientUseCase,
  ) {}

  /**
   * Sending is an act of collaboration, not of administration (§10.12) — but
   * still a write: `read_workspace_state` here let a VIEWER broadcast to the
   * whole workspace (§18.1).
   */
  @Post()
  @RequirePermission("contribute_knowledge")
  async post(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: SendNotificationDto,
  ): Promise<{ notificationId: string; recipientCount: number }> {
    const result = await this.send.execute({
      workspaceId,
      kind: dto.kind,
      scope: dto.scope,
      title: dto.title,
      body: dto.body,
      taskId: dto.taskId,
      payload: dto.payload,
      recipients: dto.recipients?.map((r) => ({
        actorType: r.actorType,
        actorId: r.actorId,
      })),
      createdByType: actor.actorType,
      createdById: actor.actorId,
      fromActorType: actor.actorType,
      fromActorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, { conflicts: ["NoRecipientsError"] });
    }
    return result.value;
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const result = await this.listNotifications.execute({
      workspaceId,
      kind: query.kind,
      taskId: query.taskId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map(toView);
  }

  /**
   * §20.4 / §26 — what this caller has not read, in THIS workspace. Scoped to
   * (workspace, actor): the workspace is in the path because §4.2 admits no
   * exception, not even for "everything waiting for me".
   */
  @Get("unread/mine")
  @RequirePermission("read_workspace_state")
  async unread(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
  ) {
    const result = await this.listUnread.execute({
      workspaceId,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map((entry) =>
      toRecipientView(entry.recipient, entry.notification),
    );
  }

  @Get(":notificationId")
  @RequirePermission("read_workspace_state")
  async one(
    @Param("workspaceId") workspaceId: string,
    @Param("notificationId") notificationId: string,
  ) {
    const result = await this.getNotification.execute({ workspaceId, notificationId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return toView(result.value);
  }

  /** An actor declares for their own row; nobody declares on their behalf. */
  @Post(":notificationId/mine")
  @HttpCode(200)
  @RequirePermission("read_workspace_state")
  async mine(
    @Param("workspaceId") workspaceId: string,
    @Param("notificationId") notificationId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: AdvanceRecipientDto,
  ): Promise<{ ok: true }> {
    const result = await this.advance.execute({
      workspaceId,
      notificationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      status: dto.status,
      failureReason: dto.failureReason,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }
}
