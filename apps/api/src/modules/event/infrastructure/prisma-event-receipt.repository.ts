import { ActorType } from "@repo/db";
import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { EventReceipt } from "../domain/event-receipt";
import { EventReceiptRepository } from "../domain/ports/event-receipt.repository.port";
import { EventReceiptMapper } from "./event-receipt.mapper";

@Injectable()
export class PrismaEventReceiptRepository implements EventReceiptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<EventReceipt | null> {
    const record = await this.prisma.eventReceipt.findUnique({ where: { id: id.toString() } });
    return record ? EventReceiptMapper.toDomain(record) : null;
  }

  async findByEventAndActor(eventId: string, actorType: ActorType, actorId: string): Promise<EventReceipt | null> {
    const record = await this.prisma.eventReceipt.findUnique({
      where: { eventId_actorType_actorId: { eventId, actorType, actorId } },
    });
    return record ? EventReceiptMapper.toDomain(record) : null;
  }

  async listByEvent(eventId: string): Promise<EventReceipt[]> {
    const records = await this.prisma.eventReceipt.findMany({ where: { eventId } });
    return records.map(EventReceiptMapper.toDomain);
  }

  async save(receipt: EventReceipt): Promise<void> {
    const data = EventReceiptMapper.toPersistence(receipt);
    await this.prisma.eventReceipt.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
