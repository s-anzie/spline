import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { TaskMapper } from "./task.mapper";

@Injectable()
export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<Task | null> {
    const record = await this.prisma.task.findUnique({ where: { id: id.toString() } });
    return record ? TaskMapper.toDomain(record) : null;
  }

  async findByIds(ids: string[]): Promise<Task[]> {
    if (ids.length === 0) {
      return [];
    }
    const records = await this.prisma.task.findMany({ where: { id: { in: ids } } });
    return records.map(TaskMapper.toDomain);
  }

  async listByWorkspace(workspaceId: string, goalId?: string): Promise<Task[]> {
    const records = await this.prisma.task.findMany({
      where: { workspaceId, ...(goalId ? { goalId } : {}) },
      orderBy: { createdAt: "asc" },
    });
    return records.map(TaskMapper.toDomain);
  }

  async listByGoal(goalId: string): Promise<Task[]> {
    const records = await this.prisma.task.findMany({ where: { goalId } });
    return records.map(TaskMapper.toDomain);
  }

  async save(task: Task): Promise<void> {
    const data = TaskMapper.toPersistence(task);
    await this.prisma.task.upsert({
      where: { id: data.id },
      create: data,
      // Full spread, not a hand-picked field list: a manually maintained
      // subset here has twice silently dropped a newly-mutable field
      // (goalId, then disabledAt on the sibling Agent repository) because
      // nothing forces this list to stay in sync with the domain entity.
      update: data,
    });
  }
}
