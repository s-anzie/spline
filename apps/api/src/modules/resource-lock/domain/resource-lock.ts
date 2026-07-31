import { ActorType, LockResourceType } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { LockAcquired, LockForceReleased, LockReleased } from "./resource-lock-events";
import {
  EmptyLockResourceIdError,
  InvalidLockExpiryError,
  LockAlreadyReleasedError,
  NotLockOwnerError,
} from "./resource-lock.errors";

export interface Actor {
  type: ActorType;
  id: string;
}

export interface ResourceLockProps {
  workspaceId: string;
  resourceType: LockResourceType;
  resourceId: string;
  lockedByType: ActorType;
  lockedById: string;
  lockedAt: Date;
  expiresAt?: Date;
  reason?: string;
  scope?: string;
  releasedAt?: Date;
}

export interface AcquireLockProps {
  workspaceId: string;
  resourceType: LockResourceType;
  resourceId: string;
  expiresAt?: Date;
  reason?: string;
  scope?: string;
  lockedBy: Actor;
}

function normalizeResourceId(resourceId: string): string {
  const trimmed = resourceId.trim();
  if (!trimmed) {
    throw new EmptyLockResourceIdError();
  }
  return trimmed;
}

export class ResourceLock extends AggregateRoot<ResourceLockProps> {
  static acquire(props: AcquireLockProps, at: Date = new Date(), id?: UniqueEntityId): ResourceLock {
    if (props.expiresAt !== undefined && props.expiresAt.getTime() <= at.getTime()) {
      throw new InvalidLockExpiryError();
    }

    const lock = new ResourceLock(
      {
        workspaceId: props.workspaceId,
        resourceType: props.resourceType,
        resourceId: normalizeResourceId(props.resourceId),
        lockedByType: props.lockedBy.type,
        lockedById: props.lockedBy.id,
        lockedAt: at,
        expiresAt: props.expiresAt,
        reason: props.reason,
        scope: props.scope,
      },
      id,
    );
    lock.record(
      new LockAcquired(
        lock.props.workspaceId,
        lock.id.toString(),
        lock.props.resourceType,
        lock.props.resourceId,
        lock.props.lockedByType,
        lock.props.lockedById,
      ),
    );
    return lock;
  }

  static reconstitute(props: ResourceLockProps, id: UniqueEntityId): ResourceLock {
    return new ResourceLock(props, id);
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get resourceType(): LockResourceType {
    return this.props.resourceType;
  }

  get resourceId(): string {
    return this.props.resourceId;
  }

  get lockedByType(): ActorType {
    return this.props.lockedByType;
  }

  get lockedById(): string {
    return this.props.lockedById;
  }

  get lockedAt(): Date {
    return this.props.lockedAt;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  get reason(): string | undefined {
    return this.props.reason;
  }

  get scope(): string | undefined {
    return this.props.scope;
  }

  get releasedAt(): Date | undefined {
    return this.props.releasedAt;
  }

  get isReleased(): boolean {
    return this.props.releasedAt !== undefined;
  }

  /** An expired-but-never-formally-released lock is not "held" — TTL expiry alone frees the resource. */
  isExpired(now: Date): boolean {
    if (this.isReleased) {
      return false;
    }
    return this.props.expiresAt !== undefined && now.getTime() >= this.props.expiresAt.getTime();
  }

  isHeld(now: Date): boolean {
    return !this.isReleased && !this.isExpired(now);
  }

  release(by: Actor, at: Date = new Date()): void {
    if (this.isReleased) {
      throw new LockAlreadyReleasedError(this.id.toString());
    }
    if (by.type !== this.props.lockedByType || by.id !== this.props.lockedById) {
      throw new NotLockOwnerError(this.id.toString());
    }
    this.props.releasedAt = at;
    this.record(new LockReleased(this.props.workspaceId, this.id.toString()));
  }

  /** Owner-level override (e.g. `manage_workspace_rules`) — bypasses the actor-match check `release()` enforces. */
  forceRelease(by: Actor, at: Date = new Date()): void {
    if (this.isReleased) {
      throw new LockAlreadyReleasedError(this.id.toString());
    }
    this.props.releasedAt = at;
    this.record(new LockForceReleased(this.props.workspaceId, this.id.toString(), by.type, by.id));
  }
}
