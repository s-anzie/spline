import { LockResourceType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Actor } from "../domain/resource-lock";
import { RESOURCE_LOCK_REPOSITORY, ResourceLockRepository } from "../domain/ports/resource-lock.repository.port";

export interface IsResourceLockedByActorInput {
  workspaceId: string;
  resourceType: LockResourceType;
  resourceId: string;
  actor: Actor;
}

@Injectable()
export class IsResourceLockedByActorUseCase {
  constructor(
    @Inject(RESOURCE_LOCK_REPOSITORY) private readonly locks: ResourceLockRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: IsResourceLockedByActorInput): Promise<boolean> {
    const now = this.clock.now();
    const activeLocks = await this.locks.listActiveByResource(
      input.workspaceId,
      input.resourceType,
      input.resourceId,
    );
    return activeLocks.some(
      (lock) =>
        lock.isHeld(now) &&
        lock.lockedByType === input.actor.type &&
        lock.lockedById === input.actor.id,
    );
  }
}
