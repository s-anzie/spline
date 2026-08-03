import { LockResourceType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Actor, ResourceLock } from "../domain/resource-lock";
import { EmptyLockResourceIdError, InvalidLockExpiryError } from "../domain/resource-lock.errors";
import { RESOURCE_LOCK_REPOSITORY, ResourceLockRepository } from "../domain/ports/resource-lock.repository.port";
import { ResourceAlreadyLockedError } from "./resource-lock-application.errors";

export interface AcquireLockInput {
  workspaceId: string;
  resourceType: LockResourceType;
  resourceId: string;
  expiresAt?: Date;
  reason?: string;
  scope?: string;
  lockedBy: Actor;
}

export type AcquireLockError =
  | WorkspaceNotFoundError
  | EmptyLockResourceIdError
  | InvalidLockExpiryError
  | ResourceAlreadyLockedError;

@Injectable()
export class AcquireLockUseCase {
  constructor(
    @Inject(RESOURCE_LOCK_REPOSITORY) private readonly locks: ResourceLockRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: AcquireLockInput): Promise<Result<ResourceLock, AcquireLockError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    const now = this.clock.now();
    const activeLocks = await this.locks.listActiveByResource(
      input.workspaceId,
      input.resourceType,
      input.resourceId,
    );
    const heldLocks = activeLocks.filter((lock) => lock.isHeld(now));
    const alreadyOwned = heldLocks.find(
      (lock) =>
        lock.lockedByType === input.lockedBy.type &&
        lock.lockedById === input.lockedBy.id,
    );
    // Acquisition is idempotent for the current owner. A provider retry after
    // a transient crash must not deadlock against the lock it already owns.
    if (alreadyOwned) return Result.ok(alreadyOwned);
    if (heldLocks.length > 0) {
      return Result.fail(new ResourceAlreadyLockedError(input.resourceType, input.resourceId));
    }

    let lock: ResourceLock;
    try {
      lock = ResourceLock.acquire(input, now);
    } catch (error) {
      if (error instanceof EmptyLockResourceIdError || error instanceof InvalidLockExpiryError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.locks.save(lock);
    this.eventPublisher.publishAll(lock.domainEvents);
    lock.clearEvents();

    return Result.ok(lock);
  }
}
