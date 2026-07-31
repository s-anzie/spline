import { LockResourceType } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { ResourceLock } from "../resource-lock";

export const RESOURCE_LOCK_REPOSITORY = Symbol("RESOURCE_LOCK_REPOSITORY");

export interface ResourceLockRepository {
  findById(id: UniqueEntityId): Promise<ResourceLock | null>;
  /** Every not-yet-released lock on this resource — the caller decides which (if any) are still held vs. expired. */
  listActiveByResource(
    workspaceId: string,
    resourceType: LockResourceType,
    resourceId: string,
  ): Promise<ResourceLock[]>;
  listByWorkspace(workspaceId: string): Promise<ResourceLock[]>;
  save(lock: ResourceLock): Promise<void>;
}
