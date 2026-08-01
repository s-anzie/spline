import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { Event } from "../domain/event";
import { EventRepository } from "../domain/ports/event.repository.port";
import { EventMapper } from "./event.mapper";

@Injectable()
export class PrismaEventRepository implements EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<Event | null> {
    const record = await this.prisma.event.findUnique({ where: { id: id.toString() } });
    return record ? EventMapper.toDomain(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<Event[]> {
    const records = await this.prisma.event.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(EventMapper.toDomain);
  }

  async save(event: Event): Promise<void> {
    const data = EventMapper.toPersistence(event);
    await this.prisma.event.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
