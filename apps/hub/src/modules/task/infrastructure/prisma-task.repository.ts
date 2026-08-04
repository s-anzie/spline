import { Injectable } from "@nestjs/common";
import { Prisma, Task as TaskRow } from "@repo/db";

import { Priority } from "../../../kernel/domain/priority";
import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Blocker } from "../domain/blocker";
import {
  GoalTaskTally,
  ListTasksFilter,
  TaskRepository,
} from "../domain/ports/task.repository.port";
import { Task, TaskStatus } from "../domain/task";

interface StoredBlocker {
  id: string;
  type: string;
  description: string;
  reportedByType: string;
  reportedById: string;
  reportedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

function blockersToDomain(raw: unknown): Blocker[] {
  return ((raw ?? []) as StoredBlocker[]).map((stored) => ({
    id: stored.id,
    type: stored.type as Blocker["type"],
    description: stored.description,
    reportedBy: ActorRef.create(stored.reportedByType as ActorType, stored.reportedById)
      .value,
    reportedAt: new Date(stored.reportedAt),
    resolvedAt: stored.resolvedAt === null ? null : new Date(stored.resolvedAt),
    resolution: stored.resolution,
  }));
}

function blockersToPersistence(blockers: readonly Blocker[]): Prisma.JsonArray {
  return blockers.map((blocker) => ({
    id: blocker.id,
    type: blocker.type,
    description: blocker.description,
    reportedByType: blocker.reportedBy.type,
    reportedById: blocker.reportedBy.actorId,
    reportedAt: blocker.reportedAt.toISOString(),
    resolvedAt: blocker.resolvedAt?.toISOString() ?? null,
    resolution: blocker.resolution,
  }));
}

export const TaskMapper = {
  toDomain(row: TaskRow): Task {
    return Task.reconstitute(
      {
        workspaceId: row.workspaceId,
        goalId: row.goalId,
        repositoryId: row.repositoryId,
        title: row.title,
        description: row.description,
        acceptanceCriteria: (row.acceptanceCriteria ?? []) as string[],
        dependsOnTaskIds: (row.dependsOnTaskIds ?? []) as string[],
        blockers: blockersToDomain(row.blockers),
        assignee: ActorRef.create(row.assigneeType as ActorType, row.assigneeId).value,
        priority: row.priority as Priority,
        status: row.status as TaskStatus,
        statusBeforeBlock: (row.statusBeforeBlock as TaskStatus | null) ?? null,
        estimatedCost: row.estimatedCost,
        estimatedDurationMinutes: row.estimatedDurationMinutes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.id,
    );
  },

  toPersistence(
    task: Task,
  ): Omit<TaskRow, "acceptanceCriteria" | "dependsOnTaskIds" | "blockers"> & {
    acceptanceCriteria: Prisma.JsonArray;
    dependsOnTaskIds: Prisma.JsonArray;
    blockers: Prisma.JsonArray;
  } {
    return {
      id: task.id.value,
      workspaceId: task.workspaceId,
      goalId: task.goalId,
      repositoryId: task.repositoryId,
      title: task.title,
      description: task.description,
      acceptanceCriteria: [...task.acceptanceCriteria],
      dependsOnTaskIds: [...task.dependsOnTaskIds],
      blockers: blockersToPersistence(task.blockers),
      assigneeType: task.assignee.type,
      assigneeId: task.assignee.actorId,
      priority: task.priority,
      status: task.status,
      statusBeforeBlock: task.statusBeforeBlock,
      estimatedCost: task.estimatedCost,
      estimatedDurationMinutes: task.estimatedDurationMinutes,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  },
};

/** §5.19: upserts the FULL mapped payload, never a hand-picked field list. */
@Injectable()
export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(task: Task): Promise<void> {
    const data = TaskMapper.toPersistence(task);
    await this.prisma.task.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<Task | null> {
    const row = await this.prisma.task.findUnique({ where: { id } });
    return row ? TaskMapper.toDomain(row) : null;
  }

  async list(filter: ListTasksFilter): Promise<Task[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.goalId !== undefined && { goalId: filter.goalId }),
        ...(filter.statuses && { status: { in: [...filter.statuses] } }),
        ...(filter.assignee && {
          assigneeType: filter.assignee.type,
          assigneeId: filter.assignee.actorId,
        }),
      },
      orderBy: { createdAt: "asc" },
    
      // An absent limit is a page, never the whole table (kernel pagination).
      take: pageSize(filter.limit),
    });
    return rows.map((row) => TaskMapper.toDomain(row));
  }

  async tallyByGoal(goalId: string): Promise<GoalTaskTally> {
    const [total, completed] = await Promise.all([
      this.prisma.task.count({ where: { goalId, status: { not: "CANCELLED" } } }),
      this.prisma.task.count({ where: { goalId, status: "COMPLETED" } }),
    ]);
    return { total, completed };
  }
}
