import { Injectable } from "@nestjs/common";
import { Run as RunRow } from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  ListRunsFilter,
  RunRepository,
} from "../domain/ports/run.repository.port";
import { Attempt, Run, RunStatus } from "../domain/run";

/** Statuses a run can still leave. §9.13 judges "too long" against these. */
const LIVE_STATUSES: RunStatus[] = ["PENDING", "RUNNING", "VALIDATING"];

@Injectable()
export class PrismaRunRepository implements RunRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole aggregate, attempts included. */
  async save(run: Run): Promise<void> {
    const data = {
      workspaceId: run.workspaceId,
      taskId: run.taskId,
      attemptNumber: run.attemptNumber,
      workerId: run.workerId,
      status: run.status,
      attempts: run.attempts as unknown as object,
      failureReason: run.failureReason,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      createdAt: run.createdAt,
    };
    await this.prisma.run.upsert({
      where: { id: run.id.value },
      create: { id: run.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<Run | null> {
    const row = await this.prisma.run.findUnique({ where: { id } });
    return row ? toRun(row) : null;
  }

  async list(filter: ListRunsFilter): Promise<Run[]> {
    const rows = await this.prisma.run.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.taskId && { taskId: filter.taskId }),
        ...(filter.status && { status: filter.status }),
      },
      // Newest first: the run an operator wants is almost always the last one.
      orderBy: { createdAt: "desc" },
      take: pageSize(filter.limit),
    });
    return rows.map(toRun);
  }

  async countForTask(taskId: string): Promise<number> {
    return this.prisma.run.count({ where: { taskId } });
  }

  async listLive(workspaceId: string, limit?: number): Promise<Run[]> {
    const rows = await this.prisma.run.findMany({
      where: { workspaceId, status: { in: LIVE_STATUSES } },
      // Oldest first: the one most likely to have overrun is the one that
      // started longest ago.
      orderBy: { createdAt: "asc" },
      take: pageSize(limit),
    });
    return rows.map(toRun);
  }

  async countLive(workspaceId: string): Promise<number> {
    return this.prisma.run.count({
      where: { workspaceId, status: { in: LIVE_STATUSES } },
    });
  }

  /**
   * Counted on `createdAt`, not `startedAt`: a run that was ordered and never
   * taken still cost a dispatch and still occupies the ceiling. Judging on
   * `startedAt` would let a machine that claims nothing be asked forever.
   */
  async liveTaskIds(
    workspaceId: string,
    taskIds: readonly string[],
  ): Promise<string[]> {
    if (taskIds.length === 0) {
      return [];
    }
    const live = await this.prisma.run.findMany({
      where: {
        workspaceId,
        taskId: { in: [...taskIds] },
        status: { in: LIVE_STATUSES },
      },
      select: { taskId: true },
      distinct: ["taskId"],
      // Bounded by what was asked about, which is the point of asking.
      take: taskIds.length,
    });
    return live.map((run) => run.taskId);
  }

  /**
   * Counted on `createdAt`, not `startedAt`: a run that was ordered and never
   * taken still cost a dispatch and still occupies the ceiling. Judging on
   * `startedAt` would let a machine that claims nothing be asked forever.
   */
  async countSince(workspaceId: string, since: Date): Promise<number> {
    return this.prisma.run.count({
      where: { workspaceId, createdAt: { gte: since } },
    });
  }
}

function toRun(row: RunRow): Run {
  return Run.reconstitute(
    {
      workspaceId: row.workspaceId,
      taskId: row.taskId,
      attemptNumber: row.attemptNumber,
      workerId: row.workerId,
      status: row.status as RunStatus,
      attempts: ((row.attempts ?? []) as unknown as Attempt[]).map((attempt) => ({
        ...attempt,
        // Dates survive JSON as strings; the domain measures durations with
        // them, and arithmetic on a string is silently wrong.
        startedAt: new Date(attempt.startedAt),
        finishedAt: attempt.finishedAt ? new Date(attempt.finishedAt) : null,
      })),
      failureReason: row.failureReason,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
    },
    row.id,
  );
}
