import { LockResourceType } from "@repo/db";
import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { ResourceLock } from "../domain/resource-lock";
import { ResourceLockRepository } from "../domain/ports/resource-lock.repository.port";
import { ResourceLockMapper } from "./resource-lock.mapper";

@Injectable()
export class PrismaResourceLockRepository implements ResourceLockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<ResourceLock | null> {
    const record = await this.prisma.resourceLock.findUnique({ where: { id: id.toString() } });
    return record ? ResourceLockMapper.toDomain(record) : null;
  }

  async listActiveByResource(
    workspaceId: string,
    resourceType: LockResourceType,
    resourceId: string,
  ): Promise<ResourceLock[]> {
    const records = await this.prisma.resourceLock.findMany({
      where: { workspaceId, resourceType, resourceId, releasedAt: null },
    });
    return records.map(ResourceLockMapper.toDomain);
  }

  async listByWorkspace(workspaceId: string): Promise<ResourceLock[]> {
    const records = await this.prisma.resourceLock.findMany({
      where: { workspaceId },
      orderBy: { lockedAt: "asc" },
    });
    return records.map(ResourceLockMapper.toDomain);
  }

  async save(lock: ResourceLock): Promise<void> {
    const data = ResourceLockMapper.toPersistence(lock);
    await this.prisma.resourceLock.upsert({
      where: { id: data.id },
      create: data,
      update: {
        releasedAt: data.releasedAt,
      },
    });
  }
}
