import { Event as PrismaEvent, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Event, EventActorRef, EventTargetRef } from "../domain/event";

export interface EventPersistenceData {
  id: string;
  workspaceId: string;
  type: string;
  severity: PrismaEvent["severity"];
  actor: Prisma.InputJsonValue;
  target: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  payload: Prisma.InputJsonValue;
  createdAt: Date;
}

export class EventMapper {
  static toDomain(record: PrismaEvent): Event {
    return Event.reconstitute(
      {
        workspaceId: record.workspaceId,
        type: record.type,
        severity: record.severity,
        actor: record.actor as unknown as EventActorRef,
        target: (record.target as unknown as EventTargetRef | null) ?? undefined,
        payload: record.payload as Record<string, unknown>,
        createdAt: record.createdAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(event: Event): EventPersistenceData {
    return {
      id: event.id.toString(),
      workspaceId: event.workspaceId,
      type: event.type,
      severity: event.severity,
      actor: event.actor as unknown as Prisma.InputJsonValue,
      target: event.target ? (event.target as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      payload: event.payload as unknown as Prisma.InputJsonValue,
      createdAt: event.createdAt,
    };
  }
}
