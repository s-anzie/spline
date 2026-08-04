import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
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
