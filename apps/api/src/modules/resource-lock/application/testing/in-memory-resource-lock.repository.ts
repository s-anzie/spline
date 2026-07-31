import { LockResourceType } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { ResourceLockRepository } from "../../domain/ports/resource-lock.repository.port";
import { ResourceLock } from "../../domain/resource-lock";

export class InMemoryResourceLockRepository implements ResourceLockRepository {
  private readonly locks = new Map<string, ResourceLock>();

  async findById(id: UniqueEntityId): Promise<ResourceLock | null> {
    return this.locks.get(id.toString()) ?? null;
  }

  async listActiveByResource(
    workspaceId: string,
    resourceType: LockResourceType,
    resourceId: string,
  ): Promise<ResourceLock[]> {
    return [...this.locks.values()].filter(
      (l) =>
        l.workspaceId === workspaceId &&
        l.resourceType === resourceType &&
        l.resourceId === resourceId &&
        !l.isReleased,
    );
  }

  async listByWorkspace(workspaceId: string): Promise<ResourceLock[]> {
    return [...this.locks.values()].filter((l) => l.workspaceId === workspaceId);
  }

  async save(lock: ResourceLock): Promise<void> {
    this.locks.set(lock.id.toString(), lock);
  }
}
