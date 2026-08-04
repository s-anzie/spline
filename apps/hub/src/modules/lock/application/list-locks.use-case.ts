import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
import { LockNotFoundError } from "../domain/lock.errors";
import { ResourceLock } from "../domain/resource-lock";
import {
  ListLocksFilter,
  LOCK_REPOSITORY,
  LockRepository,
} from "../domain/ports/lock.repository.port";

export interface ListedLock {
  lock: ResourceLock;
  /** Computed, never stored: §13.5 makes expiry automatic. */
  active: boolean;
}

@Injectable()
export class ListLocksUseCase
  implements UseCase<ListLocksFilter, Result<ListedLock[], GuardViolation>>
{
  constructor(
    @Inject(LOCK_REPOSITORY) private readonly locks: LockRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(filter: ListLocksFilter): Promise<Result<ListedLock[], GuardViolation>> {
    const workspaceId = Guard.againstEmpty(filter.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const now = this.clock.now();
    const locks = await this.locks.list({ ...filter, workspaceId: workspaceId.value });
    return Result.ok(
      locks.map((lock) => ({ lock, active: lock.isActiveAt(now) })),
    );
  }
}

/**
 * An identifier the API hands out must be resolvable through the API. This
 * one is: acquiring returns a `lockId`, and following it up
 * should not require listing everything and filtering client-side.
 */
@Injectable()
export class GetLockUseCase
  implements
    UseCase<{ workspaceId: string; lockId: string }, Result<ListedLock, LockNotFoundError>>
{
  constructor(
    @Inject(LOCK_REPOSITORY) private readonly locks: LockRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: {
    workspaceId: string;
    lockId: string;
  }): Promise<Result<ListedLock, LockNotFoundError>> {
    const lock = await this.locks.findById(input.lockId);
    if (!lock || lock.workspaceId !== input.workspaceId) {
      return Result.fail(new LockNotFoundError(input.lockId));
    }
    return Result.ok({ lock, active: lock.isActiveAt(this.clock.now()) });
  }
}
