import { Injectable } from "@nestjs/common";
import { Prisma, ResourceLock as LockRow } from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { LockStatus, ResourceLock } from "../domain/resource-lock";
import {
  LockAlreadyHeldInStoreError,
  ListLocksFilter,
  LockRepository,
} from "../domain/ports/lock.repository.port";

export const LockMapper = {
  toDomain(row: LockRow): ResourceLock {
    return ResourceLock.reconstitute(
      {
        workspaceId: row.workspaceId,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        owner: ActorRef.create(row.ownerType as ActorType, row.ownerId).value,
        reason: row.reason,
        status: row.status as LockStatus,
        acquiredAt: row.acquiredAt,
        expiresAt: row.expiresAt,
        releasedAt: row.releasedAt,
      },
      row.id,
    );
  },
};

@Injectable()
export class PrismaLockRepository implements LockRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole aggregate, never a hand-picked subset. */
  async save(lock: ResourceLock): Promise<void> {
    const data = {
      workspaceId: lock.workspaceId,
      resourceType: lock.resourceType,
      resourceId: lock.resourceId,
      // NULL the moment it stops being held: that is what makes the unique
      // index apply to live locks only.
      activeKey: lock.status === "HELD" ? lock.resource : null,
      ownerType: lock.owner.type,
      ownerId: lock.owner.actorId,
      reason: lock.reason,
      status: lock.status,
      acquiredAt: lock.acquiredAt,
      expiresAt: lock.expiresAt,
      releasedAt: lock.releasedAt,
    };
    try {
      await this.prisma.resourceLock.upsert({
        where: { id: lock.id.value },
        create: { id: lock.id.value, ...data },
        update: data,
      });
    } catch (error) {
      // P2002 — another connection won the race. Translated so the use case
      // can answer "conflict" (§13.4) rather than let a 500 escape.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new LockAlreadyHeldInStoreError(lock.resource);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<ResourceLock | null> {
    const row = await this.prisma.resourceLock.findUnique({ where: { id } });
    return row ? LockMapper.toDomain(row) : null;
  }

  async findActiveOn(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<ResourceLock | null> {
    const row = await this.prisma.resourceLock.findFirst({
      where: { workspaceId, activeKey: `${resourceType}:${resourceId}` },
    });
    return row ? LockMapper.toDomain(row) : null;
  }

  async list(filter: ListLocksFilter): Promise<ResourceLock[]> {
    const rows = await this.prisma.resourceLock.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.resourceType && { resourceType: filter.resourceType }),
        ...(filter.owner && {
          ownerType: filter.owner.type,
          ownerId: filter.owner.actorId,
        }),
        ...(filter.includeInactive ? {} : { status: "HELD" }),
      },
      orderBy: { acquiredAt: "desc" },
    
      // An absent limit is a page, never the whole table (kernel pagination).
      take: pageSize(filter.limit),
    });
    return rows.map((row) => LockMapper.toDomain(row));
  }
}
