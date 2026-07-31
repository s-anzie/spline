import { Task as PrismaTask, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Task, TaskBlocker } from "../domain/task";

export interface TaskPersistenceData {
  id: string;
  workspaceId: string;
  goalId: string | null;
  title: string;
  description: string | null;
  status: PrismaTask["status"];
  priority: PrismaTask["priority"];
  assigneeType: PrismaTask["assigneeType"];
  assigneeId: string | null;
  dependencies: Prisma.InputJsonValue;
  blockers: Prisma.InputJsonValue;
  validationState: PrismaTask["validationState"];
  createdByType: PrismaTask["createdByType"];
  createdById: string;
  updatedByType: PrismaTask["updatedByType"];
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TaskMapper {
  static toDomain(record: PrismaTask): Task {
    return Task.reconstitute(
      {
        workspaceId: record.workspaceId,
        goalId: record.goalId ?? undefined,
        title: record.title,
        description: record.description ?? undefined,
        status: record.status,
        priority: record.priority,
        assigneeType: record.assigneeType ?? undefined,
        assigneeId: record.assigneeId ?? undefined,
        dependencies: record.dependencies as string[],
        blockers: record.blockers as unknown as TaskBlocker[],
        validationState: record.validationState,
        createdByType: record.createdByType,
        createdById: record.createdById,
        updatedByType: record.updatedByType ?? undefined,
        updatedById: record.updatedById ?? undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(task: Task): TaskPersistenceData {
    return {
      id: task.id.toString(),
      workspaceId: task.workspaceId,
      goalId: task.goalId ?? null,
      title: task.title,
      description: task.description ?? null,
      status: task.status,
      priority: task.priority,
      assigneeType: task.assigneeType ?? null,
      assigneeId: task.assigneeId ?? null,
      dependencies: task.dependencies as unknown as Prisma.InputJsonValue,
      blockers: task.blockers as unknown as Prisma.InputJsonValue,
      validationState: task.validationState,
      createdByType: task.createdByType,
      createdById: task.createdById,
      updatedByType: task.updatedByType ?? null,
      updatedById: task.updatedById ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
