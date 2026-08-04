import { ActorRef } from "../../../identity/domain/actor";
import { ResourceLock } from "../resource-lock";

export interface ListLocksFilter {
  /** Mandatory (§4.2): there is no unscoped listing. */
  workspaceId: string;
  resourceType?: string;
  owner?: ActorRef;
  /** Released and expired locks stay on record; asking for them is explicit. */
  includeInactive?: boolean;
}

export interface LockRepository {
  save(lock: ResourceLock): Promise<void>;
  findById(id: string): Promise<ResourceLock | null>;
  /** The live lock on a resource, if any. Expiry is judged by the caller. */
  findActiveOn(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<ResourceLock | null>;
  list(filter: ListLocksFilter): Promise<ResourceLock[]>;
}
export const LOCK_REPOSITORY = "lock/LockRepository";

/**
 * Raised when two acquisitions race and the database refuses the second.
 * Distinguishing it from any other write failure is what lets the use case
 * report a conflict (§13.4) instead of a 500.
 */
export class LockAlreadyHeldInStoreError extends Error {}
