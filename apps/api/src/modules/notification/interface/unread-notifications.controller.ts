import { ActorType } from "@repo/db";
import { Controller, ForbiddenException, Get, Query, UseGuards } from "@nestjs/common";

import { AuthenticatedRequester, CurrentRequester, JwtAuthGuard } from "../../identity/interface";
import { ListUnreadNotificationsForRecipientUseCase } from "../application/list-unread-notifications-for-recipient.use-case";
import { ListUnreadNotificationsQueryDto } from "./dto/list-unread-notifications.dto";

/**
 * Deliberately global, not under /workspaces/:workspaceId — spec 13.2 requires
 * a recipient's unread notifications to be queryable across every workspace
 * at once, so this can't sit behind PermissionsGuard (which requires a
 * :workspaceId route param), same precedent as ProviderProfileController.
 */
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class UnreadNotificationsController {
  constructor(private readonly listUnreadNotificationsForRecipientUseCase: ListUnreadNotificationsForRecipientUseCase) {}

  @Get("unread")
  async listUnread(
    @Query() query: ListUnreadNotificationsQueryDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    if (
      requester.type !== ActorType.HUMAN ||
      query.recipientType !== ActorType.HUMAN ||
      query.recipientId !== requester.id
    )
      throw new ForbiddenException("Unread notifications may only be read by their recipient");
    const unread = await this.listUnreadNotificationsForRecipientUseCase.execute({
      recipientType: query.recipientType,
      recipientId: query.recipientId,
    });

    return unread.map(({ notification, recipient }) => ({
      notification: {
        id: notification.id.toString(),
        workspaceId: notification.workspaceId,
        kind: notification.kind,
        scope: notification.scope,
        taskId: notification.taskId ?? null,
        title: notification.title ?? null,
        body: notification.body,
        payload: notification.payload,
        createdBy: notification.createdBy,
        createdAt: notification.createdAt.toISOString(),
      },
      recipient: {
        id: recipient.id.toString(),
        deliveryStatus: recipient.deliveryStatus,
        deliveredAt: recipient.deliveredAt?.toISOString() ?? null,
        lastSeenAt: recipient.lastSeenAt?.toISOString() ?? null,
      },
    }));
  }
}
