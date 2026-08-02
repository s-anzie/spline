import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { Agent } from "../domain/agent";
import { AgentRepository } from "../domain/ports/agent.repository.port";
import { AgentMapper } from "./agent.mapper";

@Injectable()
export class PrismaAgentRepository implements AgentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<Agent | null> {
    const record = await this.prisma.agent.findUnique({ where: { id: id.toString() } });
    return record ? AgentMapper.toDomain(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<Agent[]> {
    const records = await this.prisma.agent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(AgentMapper.toDomain);
  }

  async save(agent: Agent): Promise<void> {
    const data = AgentMapper.toPersistence(agent);
    await this.prisma.agent.upsert({
      where: { id: data.id },
      create: data,
      update: {
        provider: data.provider,
        displayName: data.displayName,
        capabilities: data.capabilities,
        status: data.status,
        currentTaskId: data.currentTaskId,
        lastSeenAt: data.lastSeenAt,
        promptProfile: data.promptProfile,
        permissions: data.permissions,
        healthState: data.healthState,
        disabledAt: data.disabledAt,
        updatedAt: data.updatedAt,
      },
    });
  }
}
