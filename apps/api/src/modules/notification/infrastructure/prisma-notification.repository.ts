import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { Notification } from "../domain/notification";
import { NotificationRepository } from "../domain/ports/notification.repository.port";
import { NotificationMapper } from "./notification.mapper";

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<Notification | null> {
    const record = await this.prisma.notification.findUnique({ where: { id: id.toString() } });
    return record ? NotificationMapper.toDomain(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<Notification[]> {
    const records = await this.prisma.notification.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(NotificationMapper.toDomain);
  }

  async save(notification: Notification): Promise<void> {
    const data = NotificationMapper.toPersistence(notification);
    await this.prisma.notification.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
