import { Goal as PrismaGoal, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Goal, GoalBlocker } from "../domain/goal";

export interface GoalPersistenceData {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  status: PrismaGoal["status"];
  priority: PrismaGoal["priority"];
  ownerType: PrismaGoal["ownerType"];
  ownerId: string;
  successCriteria: Prisma.InputJsonValue;
  progressPercentage: number;
  startDate: Date | null;
  dueDate: Date | null;
  dependencies: Prisma.InputJsonValue;
  blockers: Prisma.InputJsonValue;
  validationState: PrismaGoal["validationState"];
  createdAt: Date;
  updatedAt: Date;
}

export class GoalMapper {
  static toDomain(record: PrismaGoal): Goal {
    return Goal.reconstitute(
      {
        workspaceId: record.workspaceId,
        title: record.title,
        description: record.description ?? undefined,
        status: record.status,
        priority: record.priority,
        ownerType: record.ownerType,
        ownerId: record.ownerId,
        successCriteria: record.successCriteria as unknown[],
        progressPercentage: record.progressPercentage,
        startDate: record.startDate ?? undefined,
        dueDate: record.dueDate ?? undefined,
        dependencies: record.dependencies as string[],
        blockers: record.blockers as unknown as GoalBlocker[],
        validationState: record.validationState,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(goal: Goal): GoalPersistenceData {
    return {
      id: goal.id.toString(),
      workspaceId: goal.workspaceId,
      title: goal.title,
      description: goal.description ?? null,
      status: goal.status,
      priority: goal.priority,
      ownerType: goal.ownerType,
      ownerId: goal.ownerId,
      successCriteria: goal.successCriteria as unknown as Prisma.InputJsonValue,
      progressPercentage: goal.progressPercentage,
      startDate: goal.startDate ?? null,
      dueDate: goal.dueDate ?? null,
      dependencies: goal.dependencies as unknown as Prisma.InputJsonValue,
      blockers: goal.blockers as unknown as Prisma.InputJsonValue,
      validationState: goal.validationState,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  }
}
