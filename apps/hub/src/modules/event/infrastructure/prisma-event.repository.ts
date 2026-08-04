import { Injectable } from "@nestjs/common";
import {
  Event as EventRow,
  EventReceipt as EventReceiptRow,
  Prisma,
} from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Event } from "../domain/event";
import { EventReceipt, ReceiptStatus } from "../domain/event-receipt";
import { EventSeverity } from "../domain/event-severity";
import {
  DEFAULT_EVENT_PAGE,
  EventReceiptRepository,
  EventRepository,
  ListEventsFilter,
  ListReceiptsFilter,
  MAX_EVENT_PAGE,
} from "../domain/ports/event.repository.port";

function actorOf(type: string | null, id: string | null): ActorRef | null {
  return type && id ? ActorRef.create(type as ActorType, id).value : null;
}

export const EventMapper = {
  toDomain(row: EventRow): Event {
    return Event.reconstitute(
      {
        workspaceId: row.workspaceId,
        type: row.type,
        severity: row.severity as EventSeverity,
        actor: actorOf(row.actorType, row.actorId),
        targetType: row.targetType,
        targetId: row.targetId,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        sequence: row.sequence,
        createdAt: row.createdAt,
      },
      row.id,
    );
  },
};

/**
 * Append-only by construction: there is no update path, because §14.1 calls
 * events immutable and §14.3 says each is published exactly once.
 */
@Injectable()
export class PrismaEventRepository implements EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(event: Event): Promise<Event> {
    const row = await this.prisma.event.create({
      data: {
        id: event.id.value,
        workspaceId: event.workspaceId,
        type: event.type,
        severity: event.severity,
        actorType: event.actor?.type ?? null,
        actorId: event.actor?.actorId ?? null,
        targetType: event.targetType,
        targetId: event.targetId,
        payload: event.payload as Prisma.JsonObject,
        createdAt: event.createdAt,
      },
    });
    // The store owns the ordering, so the caller gets back the sequence.
    return EventMapper.toDomain(row);
  }

  async findById(id: string): Promise<Event | null> {
    const row = await this.prisma.event.findUnique({ where: { id } });
    return row ? EventMapper.toDomain(row) : null;
  }

  async list(filter: ListEventsFilter): Promise<Event[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        ...(filter.workspaceId !== undefined && { workspaceId: filter.workspaceId }),
        ...(filter.type !== undefined && { type: filter.type }),
        ...(filter.severities && { severity: { in: [...filter.severities] } }),
        ...(filter.targetType !== undefined && { targetType: filter.targetType }),
        ...(filter.targetId !== undefined && { targetId: filter.targetId }),
        ...(filter.actor && {
          actorType: filter.actor.type,
          actorId: filter.actor.actorId,
        }),
        ...(filter.afterSequence !== undefined && {
          sequence: { gt: filter.afterSequence },
        }),
      },
      // Sequence, never createdAt: two facts can share a millisecond.
      orderBy: { sequence: "asc" },
      // Always bounded: an absent limit is a page, never the whole journal.
      take: Math.min(filter.limit ?? DEFAULT_EVENT_PAGE, MAX_EVENT_PAGE),
    });
    return rows.map((row) => EventMapper.toDomain(row));
  }
}

export const EventReceiptMapper = {
  toDomain(row: EventReceiptRow): EventReceipt {
    return EventReceipt.reconstitute(
      {
        eventId: row.eventId,
        actor: ActorRef.create(row.actorType as ActorType, row.actorId).value,
        status: row.status as ReceiptStatus,
        seenAt: row.seenAt,
        acknowledgedAt: row.acknowledgedAt,
        actedAt: row.actedAt,
        createdAt: row.createdAt,
      },
      row.id,
    );
  },

  toPersistence(receipt: EventReceipt): Omit<EventReceiptRow, never> {
    return {
      id: receipt.id.value,
      eventId: receipt.eventId,
      actorType: receipt.actor.type,
      actorId: receipt.actor.actorId,
      status: receipt.status,
      seenAt: receipt.seenAt,
      acknowledgedAt: receipt.acknowledgedAt,
      actedAt: receipt.actedAt,
      createdAt: receipt.createdAt,
    };
  },
};

/** §5.19: upserts the FULL mapped payload. */
@Injectable()
export class PrismaEventReceiptRepository implements EventReceiptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(receipt: EventReceipt): Promise<void> {
    const data = EventReceiptMapper.toPersistence(receipt);
    await this.prisma.eventReceipt.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<EventReceipt | null> {
    const row = await this.prisma.eventReceipt.findUnique({ where: { id } });
    return row ? EventReceiptMapper.toDomain(row) : null;
  }

  async findByEventAndActor(
    workspaceId: string,
    eventId: string,
    actor: ActorRef,
  ): Promise<EventReceipt | null> {
    const row = await this.prisma.eventReceipt.findFirst({
      where: {
        eventId,
        actorType: actor.type,
        actorId: actor.actorId,
        event: { workspaceId },
      },
    });
    return row ? EventReceiptMapper.toDomain(row) : null;
  }

  async list(filter: ListReceiptsFilter): Promise<EventReceipt[]> {
    const rows = await this.prisma.eventReceipt.findMany({
      where: {
        event: { workspaceId: filter.workspaceId },
        actorType: filter.actor.type,
        actorId: filter.actor.actorId,
        ...(filter.statuses && { status: { in: [...filter.statuses] } }),
      },
      orderBy: { createdAt: "asc" },
      // An absent limit is a page, never everything an actor ever owed an
      // answer to (kernel pagination).
      take: pageSize(undefined),
    });
    return rows.map((row) => EventReceiptMapper.toDomain(row));
  }
}
