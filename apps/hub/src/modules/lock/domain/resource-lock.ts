import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { isExpired } from "../../../kernel/domain/staleness";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";
import { LockNotHeldError } from "./lock.errors";

export const LOCK_STATUSES = ["HELD", "RELEASED", "EXPIRED"] as const;
export type LockStatus = (typeof LOCK_STATUSES)[number];

export class LockAcquired extends BaseDomainEvent {
  readonly eventName = "lock.acquired";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly resourceType: string,
    readonly resourceId: string,
    readonly owner: ActorRef,
    readonly expiresAt: Date,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class LockReleased extends BaseDomainEvent {
  readonly eventName = "lock.released";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly resourceType: string,
    readonly resourceId: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

/** §17.9 lists "Lease Expired" among the alerts. */
export class LockLeaseExpired extends BaseDomainEvent {
  readonly eventName = "lock.lease_expired";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly resourceType: string,
    readonly resourceId: string,
    readonly owner: ActorRef,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

/**
 * §13: a lock "possède toujours une durée de vie", so zero is as invalid as a
 * negative. Checked here rather than in the kernel: the entry criterion is
 * that at least two modules need a primitive, and only this one does today.
 */
function positiveTtl(ttlMs: number): Result<number, GuardViolation> {
  return Number.isFinite(ttlMs) && ttlMs > 0
    ? Result.ok(ttlMs)
    : Result.fail(new GuardViolation("ttlMs", "must be a positive number of milliseconds"));
}

interface LockProps {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  owner: ActorRef;
  reason: string;
  status: LockStatus;
  acquiredAt: Date;
  expiresAt: Date;
  releasedAt: Date | null;
}

export interface AcquireLockProps {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  owner: ActorRef;
  reason: string;
  ttlMs: number;
  now: Date;
}

/**
 * §4.16 — protects one precise resource, never a whole task. The resource is
 * opaque on purpose: a foreign key towards processes, files or branches would
 * make this module depend on everything it protects.
 */
export class ResourceLock extends AggregateRoot<LockProps> {
  static acquire(
    input: AcquireLockProps,
    id?: UniqueEntityId,
  ): Result<ResourceLock, GuardViolation> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const resourceType = Guard.againstEmpty(input.resourceType, "resourceType");
    if (resourceType.isFailure) {
      return Result.fail(resourceType.error);
    }
    const resourceId = Guard.againstEmpty(input.resourceId, "resourceId");
    if (resourceId.isFailure) {
      return Result.fail(resourceId.error);
    }
    // §4.16 keeps `reason` in the fields: a lock nobody can explain is a lock
    // nobody dares break.
    const reason = Guard.againstEmpty(input.reason, "reason");
    if (reason.isFailure) {
      return Result.fail(reason.error);
    }
    const ttl = positiveTtl(input.ttlMs);
    if (ttl.isFailure) {
      return Result.fail(ttl.error);
    }

    const lock = new ResourceLock(
      {
        workspaceId: workspaceId.value,
        resourceType: resourceType.value,
        resourceId: resourceId.value,
        owner: input.owner,
        reason: reason.value,
        status: "HELD",
        acquiredAt: input.now,
        expiresAt: new Date(input.now.getTime() + ttl.value),
        releasedAt: null,
      },
      id,
    );
    lock.addDomainEvent(
      new LockAcquired(
        lock.id.value,
        input.now,
        workspaceId.value,
        resourceType.value,
        resourceId.value,
        input.owner,
        lock.expiresAt,
      ),
    );
    return Result.ok(lock);
  }

  static reconstitute(props: LockProps, id: string): ResourceLock {
    return new ResourceLock(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get resourceType(): string {
    return this.props.resourceType;
  }

  get resourceId(): string {
    return this.props.resourceId;
  }

  get resource(): string {
    return `${this.props.resourceType}:${this.props.resourceId}`;
  }

  get owner(): ActorRef {
    return this.props.owner;
  }

  get reason(): string {
    return this.props.reason;
  }

  get status(): LockStatus {
    return this.props.status;
  }

  get acquiredAt(): Date {
    return this.props.acquiredAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get releasedAt(): Date | null {
    return this.props.releasedAt;
  }

  /**
   * §13.5 — expiry is computed, not swept. A lease that has run out stops
   * holding anything at that instant, with no background task involved.
   */
  isActiveAt(now: Date): boolean {
    return this.props.status === "HELD" && !isExpired(this.props.expiresAt, now);
  }

  /** First of the two paths (§13.7): the very same actor. */
  isHeldBy(actor: ActorRef, now: Date): boolean {
    return this.isActiveAt(now) && this.props.owner.equals(actor);
  }

  canBeManagedBy(actor: ActorRef, now: Date): boolean {
    return this.isHeldBy(actor, now);
  }

  renew(ttlMs: number, now: Date): Result<void, GuardViolation | LockNotHeldError> {
    const ttl = positiveTtl(ttlMs);
    if (ttl.isFailure) {
      return Result.fail(ttl.error);
    }
    if (!this.isActiveAt(now)) {
      return Result.fail(new LockNotHeldError(this.resource));
    }
    this.props.expiresAt = new Date(now.getTime() + ttl.value);
    this.addDomainEvent(
      new LockAcquired(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.resourceType,
        this.props.resourceId,
        this.props.owner,
        this.props.expiresAt,
      ),
    );
    return Result.ok(undefined);
  }

  /** Released, not deleted (§18.7). Idempotent. */
  release(now: Date): Result<void, never> {
    if (this.props.status !== "HELD") {
      return Result.ok(undefined);
    }
    this.props.status = "RELEASED";
    this.props.releasedAt = now;
    this.addDomainEvent(
      new LockReleased(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.resourceType,
        this.props.resourceId,
      ),
    );
    return Result.ok(undefined);
  }

  /**
   * Records what was already true. Refused while the lease still runs, so a
   * caller cannot use it to evict a live holder through the back door.
   */
  expire(now: Date): Result<void, LockNotHeldError> {
    if (this.props.status !== "HELD" || !isExpired(this.props.expiresAt, now)) {
      return Result.fail(new LockNotHeldError(this.resource));
    }
    this.props.status = "EXPIRED";
    this.addDomainEvent(
      new LockLeaseExpired(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.resourceType,
        this.props.resourceId,
        this.props.owner,
      ),
    );
    return Result.ok(undefined);
  }
}
