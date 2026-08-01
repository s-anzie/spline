import { Notification as PrismaNotification, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Notification, NotificationCreatorRef } from "../domain/notification";

export interface NotificationPersistenceData {
  id: string;
  workspaceId: string;
  kind: PrismaNotification["kind"];
  scope: PrismaNotification["scope"];
  taskId: string | null;
  title: string | null;
  body: string;
  payload: Prisma.InputJsonValue;
  linkedEventId: string | null;
  createdBy: Prisma.InputJsonValue;
  createdAt: Date;
}

export class NotificationMapper {
  static toDomain(record: PrismaNotification): Notification {
    return Notification.reconstitute(
      {
        workspaceId: record.workspaceId,
        kind: record.kind,
        scope: record.scope,
        taskId: record.taskId ?? undefined,
        title: record.title ?? undefined,
        body: record.body,
        payload: record.payload as Record<string, unknown>,
        linkedEventId: record.linkedEventId ?? undefined,
        createdBy: record.createdBy as unknown as NotificationCreatorRef,
        createdAt: record.createdAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(notification: Notification): NotificationPersistenceData {
    return {
      id: notification.id.toString(),
      workspaceId: notification.workspaceId,
      kind: notification.kind,
      scope: notification.scope,
      taskId: notification.taskId ?? null,
      title: notification.title ?? null,
      body: notification.body,
      payload: notification.payload as unknown as Prisma.InputJsonValue,
      linkedEventId: notification.linkedEventId ?? null,
      createdBy: notification.createdBy as unknown as Prisma.InputJsonValue,
      createdAt: notification.createdAt,
    };
  }
}
