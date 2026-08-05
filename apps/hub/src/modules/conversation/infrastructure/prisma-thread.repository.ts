import { Injectable } from "@nestjs/common";
import { Thread as ThreadRow } from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  ListThreadsFilter,
  ThreadRepository,
} from "../domain/ports/thread.repository.port";
import { Thread, ThreadStatus, Turn } from "../domain/thread";

@Injectable()
export class PrismaThreadRepository implements ThreadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole aggregate, turns included. */
  async save(thread: Thread): Promise<void> {
    const data = {
      workspaceId: thread.workspaceId,
      initiatorType: thread.initiator.type,
      initiatorId: thread.initiator.actorId,
      participantType: thread.participant.type,
      participantId: thread.participant.actorId,
      subject: thread.subject,
      taskId: thread.taskId,
      turnBudget: thread.turnBudget,
      turns: thread.turns.map((turn) => ({
        id: turn.id,
        actorType: turn.actor.type,
        actorId: turn.actor.actorId,
        message: turn.message,
        at: turn.at.toISOString(),
      })) as unknown as object,
      status: thread.status,
      outcome: (thread.outcome ?? undefined) as object | undefined,
      createdAt: thread.createdAt,
      endedAt: thread.endedAt,
    };
    await this.prisma.thread.upsert({
      where: { id: thread.id.value },
      create: { id: thread.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<Thread | null> {
    const row = await this.prisma.thread.findUnique({ where: { id } });
    return row ? toThread(row) : null;
  }

  async list(filter: ListThreadsFilter): Promise<Thread[]> {
    const rows = await this.prisma.thread.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.status && { status: filter.status }),
        // Either side: a thread is as much the answerer's as the asker's.
        ...(filter.participant && {
          OR: [
            {
              initiatorType: filter.participant.type,
              initiatorId: filter.participant.actorId,
            },
            {
              participantType: filter.participant.type,
              participantId: filter.participant.actorId,
            },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      take: pageSize(filter.limit),
    });
    return rows.map(toThread);
  }

  async listAwaiting(taskId: string): Promise<Thread[]> {
    const rows = await this.prisma.thread.findMany({
      where: { taskId, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      take: pageSize(undefined),
    });
    return rows.map(toThread);
  }
}

interface TurnRow {
  id: string;
  actorType: string;
  actorId: string;
  message: string;
  at: string;
}

function toThread(row: ThreadRow): Thread {
  return Thread.reconstitute(
    {
      workspaceId: row.workspaceId,
      initiator: ActorRef.create(row.initiatorType as ActorType, row.initiatorId).value,
      participant: ActorRef.create(
        row.participantType as ActorType,
        row.participantId,
      ).value,
      subject: row.subject,
      taskId: row.taskId,
      turnBudget: row.turnBudget,
      turns: ((row.turns ?? []) as unknown as TurnRow[]).map(
        (turn): Turn => ({
          id: turn.id,
          actor: ActorRef.create(turn.actorType as ActorType, turn.actorId).value,
          message: turn.message,
          // Dates survive JSON as strings, and the domain compares them.
          at: new Date(turn.at),
        }),
      ),
      status: row.status as ThreadStatus,
      outcome: (row.outcome ?? null) as Record<string, unknown> | null,
      createdAt: row.createdAt,
      endedAt: row.endedAt,
    },
    row.id,
  );
}
