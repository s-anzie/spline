import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { AgentCredentialRepository } from "../domain/ports/agent-credential.repository.port";
import { AgentCredential } from "../domain/agent-credential";
import { AgentCredentialMapper } from "./agent-credential.mapper";

@Injectable()
export class PrismaAgentCredentialRepository implements AgentCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<AgentCredential | null> {
    const record = await this.prisma.agentCredential.findUnique({ where: { id: id.toString() } });
    return record ? AgentCredentialMapper.toDomain(record) : null;
  }

  async findByAgentId(agentId: string): Promise<AgentCredential | null> {
    const record = await this.prisma.agentCredential.findUnique({ where: { agentId } });
    return record ? AgentCredentialMapper.toDomain(record) : null;
  }

  async save(credential: AgentCredential): Promise<void> {
    const data = AgentCredentialMapper.toPersistence(credential);
    await this.prisma.agentCredential.upsert({
      where: { id: data.id },
      create: data,
      // Full spread — see PrismaTaskRepository.save() for why a hand-picked
      // field list here is a recurring source of silently-dropped updates.
      update: data,
    });
  }
}
