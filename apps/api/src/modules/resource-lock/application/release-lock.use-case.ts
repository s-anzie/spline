import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PermissionsService } from "../../identity/application/permissions.service";
import { Actor, ResourceLock } from "../domain/resource-lock";
import { LockAlreadyReleasedError, NotLockOwnerError } from "../domain/resource-lock.errors";
import { RESOURCE_LOCK_REPOSITORY, ResourceLockRepository } from "../domain/ports/resource-lock.repository.port";
import { LockNotFoundError } from "./resource-lock-application.errors";

export interface ReleaseLockInput {
  lockId: string;
  releasedBy: Actor;
}

export type ReleaseLockError = LockNotFoundError | NotLockOwnerError | LockAlreadyReleasedError;

@Injectable()
export class ReleaseLockUseCase {
  constructor(
    @Inject(RESOURCE_LOCK_REPOSITORY) private readonly locks: ResourceLockRepository,
    private readonly permissionsService: PermissionsService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: ReleaseLockInput): Promise<Result<ResourceLock, ReleaseLockError>> {
    const lock = await this.locks.findById(UniqueEntityId.create(input.lockId));
    if (!lock) {
      return Result.fail(new LockNotFoundError(input.lockId));
    }

    const now = this.clock.now();
    try {
      lock.release(input.releasedBy, now);
    } catch (error) {
      if (error instanceof LockAlreadyReleasedError) {
        return Result.fail(error);
      }
      if (error instanceof NotLockOwnerError) {
        const canOverride = await this.permissionsService.can(
          input.releasedBy.type,
          input.releasedBy.id,
          lock.workspaceId,
          "manage_workspace_rules",
        );
        if (!canOverride) {
          return Result.fail(error);
        }
        lock.forceRelease(input.releasedBy, now);
      } else {
        throw error;
      }
    }

    await this.locks.save(lock);
    this.eventPublisher.publishAll(lock.domainEvents);
    lock.clearEvents();

    return Result.ok(lock);
  }
}
