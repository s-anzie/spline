import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import { WorkspaceNotFoundError } from "../../workspace/domain/workspace.errors";
import { LockConflictError } from "../domain/lock.errors";
import { ResourceLock } from "../domain/resource-lock";
import {
  LOCK_TTL_POLICY,
  LockTtlPolicyPort,
} from "../domain/ports/lock-ttl-policy.port";
import {
  LOCK_REPOSITORY,
  LockAlreadyHeldInStoreError,
  LockRepository,
} from "../domain/ports/lock.repository.port";

export const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;

export interface AcquireLockInput {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  actorType: ActorType;
  actorId: string;
  ttlMs?: number;
}

export interface AcquiredLock {
  lockId: string;
  expiresAt: Date;
  /** True when the caller already held it — §13.7's idempotent path. */
  reacquired: boolean;
}

export type AcquireLockError =
  | GuardViolation
  | WorkspaceNotFoundError
  | LockConflictError;

/**
 * §13.2 Acquire → Granted, or Acquire → Rejected.
 *
 * The two paths §13.7 insists on are visible here as two distinct branches:
 * the holder re-acquiring changes nothing, a different actor gets a conflict.
 * The spec devotes a whole paragraph to it because a previous codebase tested
 * the second with the same actor as the first and covered neither (0.3.5).
 */
@Injectable()
export class AcquireLockUseCase
  implements UseCase<AcquireLockInput, Result<AcquiredLock, AcquireLockError>>
{
  constructor(
    @Inject(LOCK_REPOSITORY) private readonly locks: LockRepository,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(LOCK_TTL_POLICY) private readonly ttlPolicy: LockTtlPolicyPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: AcquireLockInput,
  ): Promise<Result<AcquiredLock, AcquireLockError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    const now = this.clock.now();
    const existing = await this.locks.findActiveOn(
      input.workspaceId,
      input.resourceType,
      input.resourceId,
    );

    if (existing) {
      // ── Path 1 (§13.7): the same actor. Idempotent, no new state.
      if (existing.isHeldBy(actor.value, now)) {
        return Result.ok({
          lockId: existing.id.value,
          expiresAt: existing.expiresAt,
          reacquired: true,
        });
      }
      // ── Path 2 (§13.7): a different actor, while the lease still runs.
      if (existing.isActiveAt(now)) {
        return Result.fail(
          new LockConflictError(
            existing.resource,
            { type: existing.owner.type, id: existing.owner.actorId },
            existing.expiresAt,
          ),
        );
      }
      // Neither: the lease ran out. §13.5 says expiry is automatic and §13.6
      // calls the cleanup "recovery" — done here, at the only moment it
      // matters, rather than by a sweeper that would have to run to be right.
      existing.expire(now);
      await this.locks.save(existing);
      await flushDomainEvents(existing, this.publisher);
    }

    const lock = ResourceLock.acquire({
      workspaceId: input.workspaceId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      owner: actor.value,
      reason: input.reason,
      ttlMs: await this.grantableTtl(input),
      now,
    });
    if (lock.isFailure) {
      return Result.fail(lock.error);
    }

    try {
      await this.locks.save(lock.value);
    } catch (error) {
      // Another connection won between our read and our write. The database
      // is the arbiter, not the read: "les Locks sont distribués" (§13).
      if (error instanceof LockAlreadyHeldInStoreError) {
        const winner = await this.locks.findActiveOn(
          input.workspaceId,
          input.resourceType,
          input.resourceId,
        );
        return Result.fail(
          new LockConflictError(
            lock.value.resource,
            winner
              ? { type: winner.owner.type, id: winner.owner.actorId }
              : { type: "UNKNOWN", id: "unknown" },
            winner?.expiresAt ?? now,
          ),
        );
      }
      throw error;
    }
    await flushDomainEvents(lock.value, this.publisher);

    return Result.ok({
      lockId: lock.value.id.value,
      expiresAt: lock.value.expiresAt,
      reacquired: false,
    });
  }

  /**
   * §12.1 "limites" — a workspace may cap how long anyone holds a resource.
   * Clamped rather than refused: a caller asking for the default should not
   * be rejected for a rule it never saw, and the granted `expiresAt` comes
   * back in the response so what was actually given is visible (§20.6).
   */
  private async grantableTtl(input: AcquireLockInput): Promise<number> {
    const asked = input.ttlMs ?? DEFAULT_LOCK_TTL_MS;
    const ceiling = await this.ttlPolicy.maxTtlMsFor(input.workspaceId);
    return ceiling === null ? asked : Math.min(asked, ceiling);
  }
}
