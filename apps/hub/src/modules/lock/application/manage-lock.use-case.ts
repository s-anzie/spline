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
  LockNotFoundError,
  LockNotHeldError,
  LockNotOwnedError,
} from "../domain/lock.errors";
import { LOCK_REPOSITORY, LockRepository } from "../domain/ports/lock.repository.port";

export interface ManageLockInput {
  workspaceId: string;
  lockId: string;
  action: "RENEW" | "RELEASE";
  actorType: ActorType;
  actorId: string;
  ttlMs?: number;
  /**
   * A workspace operator forcing a release. First authorisation in this
   * codebase that turns on the actor's *identity* and not only their role:
   * someone has to be able to unblock a workspace whose holder left without
   * giving the lock back.
   */
  operatorOverride?: boolean;
}

export type ManageLockError =
  | LockNotFoundError
  | LockNotOwnedError
  | LockNotHeldError
  | GuardViolation;

@Injectable()
export class ManageLockUseCase
  implements UseCase<ManageLockInput, Result<void, ManageLockError>>
{
  constructor(
    @Inject(LOCK_REPOSITORY) private readonly locks: LockRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: ManageLockInput): Promise<Result<void, ManageLockError>> {
    const lock = await this.locks.findById(input.lockId);
    if (!lock || lock.workspaceId !== input.workspaceId) {
      return Result.fail(new LockNotFoundError(input.lockId));
    }
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    const now = this.clock.now();
    const isOwner = lock.canBeManagedBy(actor.value, now);
    // Renewing is never delegated: extending someone else's hold would let an
    // operator keep a resource for an actor who has gone quiet.
    if (!isOwner && !(input.action === "RELEASE" && input.operatorOverride)) {
      return Result.fail(
        lock.isActiveAt(now)
          ? new LockNotOwnedError(lock.resource)
          : new LockNotHeldError(lock.resource),
      );
    }

    const applied =
      input.action === "RENEW" ? lock.renew(input.ttlMs ?? 0, now) : lock.release(now);
    if (applied.isFailure) {
      return Result.fail(applied.error);
    }

    await this.locks.save(lock);
    await flushDomainEvents(lock, this.publisher);
    return Result.ok(undefined);
  }
}
