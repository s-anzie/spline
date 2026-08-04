import { Injectable } from "@nestjs/common";
import { Goal as GoalRow, Prisma } from "@repo/db";

import { Priority } from "../../../kernel/domain/priority";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Goal, GoalStatus } from "../domain/goal";
import {
  GoalRepository,
  ListGoalsFilter,
} from "../domain/ports/goal.repository.port";

export const GoalMapper = {
  toDomain(row: GoalRow): Goal {
    return Goal.reconstitute(
      {
        workspaceId: row.workspaceId,
        parentGoalId: row.parentGoalId,
        title: row.title,
        description: row.description,
        successCriteria: (row.successCriteria ?? []) as string[],
        dependsOnGoalIds: (row.dependsOnGoalIds ?? []) as string[],
        priority: row.priority as Priority,
        owner: ActorRef.create(row.ownerType as ActorType, row.ownerId).value,
        progress: row.progress,
        status: row.status as GoalStatus,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.id,
    );
  },

  toPersistence(
    goal: Goal,
  ): Omit<GoalRow, "successCriteria" | "dependsOnGoalIds"> & {
    successCriteria: Prisma.JsonArray;
    dependsOnGoalIds: Prisma.JsonArray;
  } {
    return {
      id: goal.id.value,
      workspaceId: goal.workspaceId,
      parentGoalId: goal.parentGoalId,
      title: goal.title,
      description: goal.description,
      successCriteria: [...goal.successCriteria],
      dependsOnGoalIds: [...goal.dependsOnGoalIds],
      priority: goal.priority,
      ownerType: goal.owner.type,
      ownerId: goal.owner.actorId,
      progress: goal.progress,
      status: goal.status,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  },
};

/** §5.19: upserts the FULL mapped payload, never a hand-picked field list. */
@Injectable()
export class PrismaGoalRepository implements GoalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(goal: Goal): Promise<void> {
    const data = GoalMapper.toPersistence(goal);
    await this.prisma.goal.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<Goal | null> {
    const row = await this.prisma.goal.findUnique({ where: { id } });
    return row ? GoalMapper.toDomain(row) : null;
  }

  async list(filter: ListGoalsFilter): Promise<Goal[]> {
    const rows = await this.prisma.goal.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.parentGoalId !== undefined && { parentGoalId: filter.parentGoalId }),
        ...(filter.statuses && { status: { in: [...filter.statuses] } }),
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => GoalMapper.toDomain(row));
  }

  async hasOpenChildren(goalId: string): Promise<boolean> {
    const open = await this.prisma.goal.count({
      where: {
        parentGoalId: goalId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    });
    return open > 0;
  }

}
