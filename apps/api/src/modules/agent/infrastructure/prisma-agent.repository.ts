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
      // Full spread, not a hand-picked field list: this exact pattern has
      // twice silently dropped a newly-mutable field (disabledAt, then
      // provider) because nothing forces a manual list to stay in sync
      // with the domain entity. See also PrismaTaskRepository.save().
      update: data,
    });
  }
}
