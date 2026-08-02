import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { WorkspaceRepository } from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";
import { WorkspaceMapper } from "./workspace.mapper";

@Injectable()
export class PrismaWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<Workspace | null> {
    const record = await this.prisma.workspace.findUnique({
      where: { id: id.toString() },
    });
    return record ? WorkspaceMapper.toDomain(record) : null;
  }

  async findByIds(ids: string[]): Promise<Workspace[]> {
    const records = await this.prisma.workspace.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "asc" },
    });
    return records.map(WorkspaceMapper.toDomain);
  }

  async listAll(): Promise<Workspace[]> {
    const records = await this.prisma.workspace.findMany({
      orderBy: { createdAt: "asc" },
    });
    return records.map(WorkspaceMapper.toDomain);
  }

  async save(workspace: Workspace): Promise<void> {
    const data = WorkspaceMapper.toPersistence(workspace);
    await this.prisma.workspace.upsert({
      where: { id: data.id },
      create: data,
      // Full spread — see PrismaTaskRepository.save() for why a hand-picked
      // field list here is a recurring source of silently-dropped updates.
      update: data,
    });
  }
}
