import { Injectable } from "@nestjs/common";
import {
  Notification as NotificationRow,
  NotificationRecipient as RecipientRow,
} from "@repo/db";

import { MAX_PAGE_SIZE, pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  DeliveryStatus,
  NotificationRecipient,
} from "../domain/notification-recipient";
import {
  Notification,
  NotificationKind,
  NotificationScope,
} from "../domain/notification";
import {
  ListNotificationsFilter,
  NotificationRecipientRepository,
  NotificationRepository,
  UnreadForActor,
} from "../domain/ports/notification.repository.port";

function actorOf(type: string | null, id: string | null): ActorRef | null {
  return type && id ? ActorRef.create(type as ActorType, id).value : null;
}

export const NotificationMapper = {
  toDomain(row: NotificationRow): Notification {
    return Notification.reconstitute(
      {
        workspaceId: row.workspaceId,
        kind: row.kind as NotificationKind,
        scope: row.scope as NotificationScope,
        taskId: row.taskId,
        fromActor: actorOf(row.fromActorType, row.fromActorId),
        title: row.title,
        body: row.body,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        createdBy: ActorRef.create(row.createdByType as ActorType, row.createdById).value,
        createdAt: row.createdAt,
      },
      row.id,
    );
  },
};

export const RecipientMapper = {
  toDomain(row: RecipientRow, workspaceId?: string | null): NotificationRecipient {
    return NotificationRecipient.reconstitute(
      {
        notificationId: row.notificationId,
        recipient: ActorRef.create(row.recipientType as ActorType, row.recipientId).value,
        deliveryStatus: row.deliveryStatus as DeliveryStatus,
        deliveredAt: row.deliveredAt,
        readAt: row.readAt,
        acknowledgedAt: row.acknowledgedAt,
        actionTakenAt: row.actionTakenAt,
        lastSeenAt: row.lastSeenAt,
        failureReason: row.failureReason,
        createdAt: row.createdAt,
      },
      row.id,
      workspaceId,
    );
  },
};

/**
 * Create-and-read only: §4.18 makes a sent notification immutable, so there
 * is no update path at all — not even a private one.
 */
@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One nested create, one transaction. §4.19 requires the recipients to
   * exist the moment the notification does; two independent writes would let
   * a crash leave a message addressed to nobody — unreadable and
   * un-acknowledgeable, exactly what this entity exists to prevent.
   */
  async create(
    notification: Notification,
    recipients: readonly NotificationRecipient[],
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        id: notification.id.value,
        workspaceId: notification.workspaceId,
        kind: notification.kind,
        scope: notification.scope,
        taskId: notification.taskId,
        fromActorType: notification.fromActor?.type ?? null,
        fromActorId: notification.fromActor?.actorId ?? null,
        title: notification.title,
        body: notification.body,
        payload: notification.payload as object,
        createdByType: notification.createdBy.type,
        createdById: notification.createdBy.actorId,
        createdAt: notification.createdAt,
        recipients: {
          create: recipients.map((recipient) => ({
            id: recipient.id.value,
            recipientType: recipient.recipient.type,
            recipientId: recipient.recipient.actorId,
            deliveryStatus: recipient.deliveryStatus,
            createdAt: recipient.createdAt,
          })),
        },
      },
    });
  }

  async findById(id: string): Promise<Notification | null> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    return row ? NotificationMapper.toDomain(row) : null;
  }

  async list(filter: ListNotificationsFilter): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.kind && { kind: filter.kind }),
        ...(filter.taskId && { taskId: filter.taskId }),
      },
      orderBy: { createdAt: "desc" },
      take: pageSize(filter.limit),
    });
    return rows.map((row) => NotificationMapper.toDomain(row));
  }
}

/** Anything the recipient has not laid eyes on yet — mirrors the domain. */
const UNREAD_STATUSES: DeliveryStatus[] = ["PENDING", "DELIVERED", "FAILED"];

@Injectable()
export class PrismaNotificationRecipientRepository
  implements NotificationRecipientRepository
{
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole row, never a hand-picked subset. */
  async save(recipient: NotificationRecipient): Promise<void> {
    await this.prisma.notificationRecipient.update({
      where: { id: recipient.id.value },
      data: {
        deliveryStatus: recipient.deliveryStatus,
        deliveredAt: recipient.deliveredAt,
        readAt: recipient.readAt,
        acknowledgedAt: recipient.acknowledgedAt,
        actionTakenAt: recipient.actionTakenAt,
        lastSeenAt: recipient.lastSeenAt,
        failureReason: recipient.failureReason,
      },
    });
  }

  async findByNotificationAndActor(
    workspaceId: string,
    notificationId: string,
    actor: ActorRef,
  ): Promise<NotificationRecipient | null> {
    const row = await this.prisma.notificationRecipient.findFirst({
      where: {
        notificationId,
        recipientType: actor.type,
        recipientId: actor.actorId,
        // A recipient has no workspace of its own: it inherits its
        // notification's, so the scope is enforced through the parent.
        notification: { workspaceId },
      },
    });
    return row ? RecipientMapper.toDomain(row, workspaceId) : null;
  }

  async listUnread(workspaceId: string, actor: ActorRef): Promise<UnreadForActor[]> {
    const rows = await this.prisma.notificationRecipient.findMany({
      where: {
        recipientType: actor.type,
        recipientId: actor.actorId,
        deliveryStatus: { in: UNREAD_STATUSES },
        notification: { workspaceId },
      },
      include: { notification: true },
      orderBy: { createdAt: "desc" },
      // An actor with thousands unread must still get an answer (§10.4 makes
      // this the first call of an agent's cycle).
      take: pageSize(undefined),
    });
    return rows.map((row) => ({
      recipient: RecipientMapper.toDomain(row, workspaceId),
      notification: NotificationMapper.toDomain(row.notification),
    }));
  }

  async listByNotification(
    workspaceId: string,
    notificationId: string,
  ): Promise<NotificationRecipient[]> {
    const rows = await this.prisma.notificationRecipient.findMany({
      where: { notificationId, notification: { workspaceId } },
      orderBy: { createdAt: "asc" },
      // A broadcast fans out to the workspace's members: bounded, but with
      // room for a large one.
      take: pageSize(undefined, { fallback: MAX_PAGE_SIZE }),
    });
    return rows.map((row) => RecipientMapper.toDomain(row, workspaceId));
  }
}
