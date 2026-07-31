import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { Decision } from "../domain/decision";
import { DecisionRepository } from "../domain/ports/decision.repository.port";
import { DecisionMapper } from "./decision.mapper";

@Injectable()
export class PrismaDecisionRepository implements DecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<Decision | null> {
    const record = await this.prisma.decision.findUnique({ where: { id: id.toString() } });
    return record ? DecisionMapper.toDomain(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<Decision[]> {
    const records = await this.prisma.decision.findMany({
      where: { workspaceId },
      orderBy: { decidedAt: "asc" },
    });
    return records.map(DecisionMapper.toDomain);
  }

  async save(decision: Decision): Promise<void> {
    const data = DecisionMapper.toPersistence(decision);
    await this.prisma.decision.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
