import { ResourceLock as PrismaResourceLock } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ResourceLock } from "../domain/resource-lock";

export interface ResourceLockPersistenceData {
  id: string;
  workspaceId: string;
  resourceType: PrismaResourceLock["resourceType"];
  resourceId: string;
  lockedByType: PrismaResourceLock["lockedByType"];
  lockedById: string;
  lockedAt: Date;
  expiresAt: Date | null;
  reason: string | null;
  scope: string | null;
  releasedAt: Date | null;
}

export class ResourceLockMapper {
  static toDomain(record: PrismaResourceLock): ResourceLock {
    return ResourceLock.reconstitute(
      {
        workspaceId: record.workspaceId,
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        lockedByType: record.lockedByType,
        lockedById: record.lockedById,
        lockedAt: record.lockedAt,
        expiresAt: record.expiresAt ?? undefined,
        reason: record.reason ?? undefined,
        scope: record.scope ?? undefined,
        releasedAt: record.releasedAt ?? undefined,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(lock: ResourceLock): ResourceLockPersistenceData {
    return {
      id: lock.id.toString(),
      workspaceId: lock.workspaceId,
      resourceType: lock.resourceType,
      resourceId: lock.resourceId,
      lockedByType: lock.lockedByType,
      lockedById: lock.lockedById,
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt ?? null,
      reason: lock.reason ?? null,
      scope: lock.scope ?? null,
      releasedAt: lock.releasedAt ?? null,
    };
  }
}
