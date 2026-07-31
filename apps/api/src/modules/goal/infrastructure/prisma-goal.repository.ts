import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { GoalRepository } from "../domain/ports/goal.repository.port";
import { Goal } from "../domain/goal";
import { GoalMapper } from "./goal.mapper";

@Injectable()
export class PrismaGoalRepository implements GoalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<Goal | null> {
    const record = await this.prisma.goal.findUnique({ where: { id: id.toString() } });
    return record ? GoalMapper.toDomain(record) : null;
  }

  async findByIds(ids: string[]): Promise<Goal[]> {
    if (ids.length === 0) {
      return [];
    }
    const records = await this.prisma.goal.findMany({ where: { id: { in: ids } } });
    return records.map(GoalMapper.toDomain);
  }

  async listByWorkspace(workspaceId: string): Promise<Goal[]> {
    const records = await this.prisma.goal.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(GoalMapper.toDomain);
  }

  async save(goal: Goal): Promise<void> {
    const data = GoalMapper.toPersistence(goal);
    await this.prisma.goal.upsert({
      where: { id: data.id },
      create: data,
      update: {
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        successCriteria: data.successCriteria,
        progressPercentage: data.progressPercentage,
        startDate: data.startDate,
        dueDate: data.dueDate,
        dependencies: data.dependencies,
        blockers: data.blockers,
        validationState: data.validationState,
        updatedAt: data.updatedAt,
      },
    });
  }
}
