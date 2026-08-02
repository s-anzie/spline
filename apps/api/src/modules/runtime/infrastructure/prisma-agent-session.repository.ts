import { AgentSessionStatus } from "@repo/db";
import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { AgentSession } from "../domain/agent-session";
import { AgentSessionRepository } from "../domain/ports/agent-session.repository.port";
import { AgentSessionMapper } from "./agent-session.mapper";

const TERMINAL_STATUSES: AgentSessionStatus[] = [
  AgentSessionStatus.COMPLETED,
  AgentSessionStatus.FAILED,
  AgentSessionStatus.CRASHED,
  AgentSessionStatus.STOPPED,
];

@Injectable()
export class PrismaAgentSessionRepository implements AgentSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<AgentSession | null> {
    const record = await this.prisma.agentSession.findUnique({ where: { id: id.toString() } });
    return record ? AgentSessionMapper.toDomain(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<AgentSession[]> {
    const records = await this.prisma.agentSession.findMany({
      where: { workspaceId },
      orderBy: { startedAt: "asc" },
    });
    return records.map(AgentSessionMapper.toDomain);
  }

  async listActiveByAgent(agentId: string): Promise<AgentSession[]> {
    const records = await this.prisma.agentSession.findMany({
      where: { agentId, status: { notIn: TERMINAL_STATUSES } },
    });
    return records.map(AgentSessionMapper.toDomain);
  }

  async listActiveByMachine(machineId: string): Promise<AgentSession[]> {
    const records = await this.prisma.agentSession.findMany({
      where: {
        machineId,
        status: {
          in: [
            AgentSessionStatus.STARTING,
            AgentSessionStatus.RUNNING,
            AgentSessionStatus.AWAITING_APPROVAL,
          ],
        },
      },
    });
    return records.map(AgentSessionMapper.toDomain);
  }

  async listActive(): Promise<AgentSession[]> {
    const records = await this.prisma.agentSession.findMany({
      where: {
        status: {
          in: [
            AgentSessionStatus.STARTING,
            AgentSessionStatus.RUNNING,
            AgentSessionStatus.AWAITING_APPROVAL,
          ],
        },
      },
    });
    return records.map(AgentSessionMapper.toDomain);
  }

  async save(session: AgentSession): Promise<void> {
    const data = AgentSessionMapper.toPersistence(session);
    await this.prisma.agentSession.upsert({
      where: { id: data.id },
      create: data,
      // Full spread — see PrismaTaskRepository.save() for why a hand-picked
      // field list here is a recurring source of silently-dropped updates.
      update: data,
    });
  }
}
