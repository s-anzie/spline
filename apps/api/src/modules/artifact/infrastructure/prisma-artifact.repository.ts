import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { Artifact } from "../domain/artifact";
import { ArtifactListFilter, ArtifactRepository } from "../domain/ports/artifact.repository.port";
import { ArtifactMapper } from "./artifact.mapper";

@Injectable()
export class PrismaArtifactRepository implements ArtifactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<Artifact | null> {
    const record = await this.prisma.artifact.findUnique({ where: { id: id.toString() } });
    return record ? ArtifactMapper.toDomain(record) : null;
  }

  async list(filter: ArtifactListFilter): Promise<Artifact[]> {
    const records = await this.prisma.artifact.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.goalId !== undefined ? { goalId: filter.goalId } : {}),
        ...(filter.taskId !== undefined ? { taskId: filter.taskId } : {}),
        ...(filter.decisionId !== undefined ? { decisionId: filter.decisionId } : {}),
        ...(filter.processId !== undefined ? { processId: filter.processId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    return records.map(ArtifactMapper.toDomain);
  }

  async save(artifact: Artifact): Promise<void> {
    const data = ArtifactMapper.toPersistence(artifact);
    await this.prisma.artifact.upsert({
      where: { id: data.id },
      create: data,
      update: {
        goalId: data.goalId,
        taskId: data.taskId,
        decisionId: data.decisionId,
        processId: data.processId,
        name: data.name,
        description: data.description,
        status: data.status,
        version: data.version,
        versions: data.versions,
        source: data.source,
        contentRef: data.contentRef,
        checksum: data.checksum,
        updatedByType: data.updatedByType,
        updatedById: data.updatedById,
        updatedAt: data.updatedAt,
      },
    });
  }

  async delete(id: UniqueEntityId): Promise<void> {
    await this.prisma.artifact.delete({ where: { id: id.toString() } });
  }
}
