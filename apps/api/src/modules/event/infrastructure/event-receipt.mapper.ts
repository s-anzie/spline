import { EventReceipt as PrismaEventReceipt } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { EventReceipt } from "../domain/event-receipt";

export interface EventReceiptPersistenceData {
  id: string;
  eventId: string;
  actorType: PrismaEventReceipt["actorType"];
  actorId: string;
  status: PrismaEventReceipt["status"];
  seenAt: Date | null;
  acknowledgedAt: Date | null;
  actedAt: Date | null;
}

export class EventReceiptMapper {
  static toDomain(record: PrismaEventReceipt): EventReceipt {
    return EventReceipt.reconstitute(
      {
        eventId: record.eventId,
        actorType: record.actorType,
        actorId: record.actorId,
        status: record.status,
        seenAt: record.seenAt ?? undefined,
        acknowledgedAt: record.acknowledgedAt ?? undefined,
        actedAt: record.actedAt ?? undefined,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(receipt: EventReceipt): EventReceiptPersistenceData {
    return {
      id: receipt.id.toString(),
      eventId: receipt.eventId,
      actorType: receipt.actorType,
      actorId: receipt.actorId,
      status: receipt.status,
      seenAt: receipt.seenAt ?? null,
      acknowledgedAt: receipt.acknowledgedAt ?? null,
      actedAt: receipt.actedAt ?? null,
    };
  }
}
