import { Agent as PrismaAgent, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Agent } from "../domain/agent";

export interface AgentPersistenceData {
  id: string;
  workspaceId: string;
  provider: string;
  displayName: string;
  capabilities: Prisma.InputJsonValue;
  status: PrismaAgent["status"];
  currentTaskId: string | null;
  lastSeenAt: Date | null;
  promptProfile: Prisma.InputJsonValue;
  permissions: Prisma.InputJsonValue;
  healthState: PrismaAgent["healthState"];
  createdAt: Date;
  updatedAt: Date;
}

export class AgentMapper {
  static toDomain(record: PrismaAgent): Agent {
    return Agent.reconstitute(
      {
        workspaceId: record.workspaceId,
        provider: record.provider,
        displayName: record.displayName,
        capabilities: record.capabilities as string[],
        status: record.status,
        currentTaskId: record.currentTaskId ?? undefined,
        lastSeenAt: record.lastSeenAt ?? undefined,
        promptProfile: record.promptProfile as Record<string, unknown>,
        permissions: record.permissions as string[],
        healthState: record.healthState,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(agent: Agent): AgentPersistenceData {
    return {
      id: agent.id.toString(),
      workspaceId: agent.workspaceId,
      provider: agent.provider,
      displayName: agent.displayName,
      capabilities: agent.capabilities as unknown as Prisma.InputJsonValue,
      status: agent.status,
      currentTaskId: agent.currentTaskId ?? null,
      lastSeenAt: agent.lastSeenAt ?? null,
      promptProfile: agent.promptProfile as unknown as Prisma.InputJsonValue,
      permissions: agent.permissions as unknown as Prisma.InputJsonValue,
      healthState: agent.healthState,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }
}
