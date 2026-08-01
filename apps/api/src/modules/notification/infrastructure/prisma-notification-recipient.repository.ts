import { ActorType } from "@repo/db";
import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { NotificationRecipient } from "../domain/notification-recipient";
import { NotificationRecipientRepository } from "../domain/ports/notification-recipient.repository.port";
import { NotificationRecipientMapper } from "./notification-recipient.mapper";

@Injectable()
export class PrismaNotificationRecipientRepository implements NotificationRecipientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<NotificationRecipient | null> {
    const record = await this.prisma.notificationRecipient.findUnique({ where: { id: id.toString() } });
    return record ? NotificationRecipientMapper.toDomain(record) : null;
  }

  async findByNotificationAndRecipient(
    notificationId: string,
    recipientType: ActorType,
    recipientId: string,
  ): Promise<NotificationRecipient | null> {
    const record = await this.prisma.notificationRecipient.findUnique({
      where: { notificationId_recipientType_recipientId: { notificationId, recipientType, recipientId } },
    });
    return record ? NotificationRecipientMapper.toDomain(record) : null;
  }

  async listByNotification(notificationId: string): Promise<NotificationRecipient[]> {
    const records = await this.prisma.notificationRecipient.findMany({ where: { notificationId } });
    return records.map(NotificationRecipientMapper.toDomain);
  }

  async listUnreadByRecipient(recipientType: ActorType, recipientId: string): Promise<NotificationRecipient[]> {
    const records = await this.prisma.notificationRecipient.findMany({
      where: { recipientType, recipientId, readAt: null },
    });
    return records.map(NotificationRecipientMapper.toDomain);
  }

  async save(recipient: NotificationRecipient): Promise<void> {
    const data = NotificationRecipientMapper.toPersistence(recipient);
    await this.prisma.notificationRecipient.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
