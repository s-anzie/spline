import { ActorType, LockResourceType } from "@repo/db";

import { DomainEvent } from "../../../kernel/domain/domain-event";

export class LockAcquired extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly lockId: string,
    public readonly resourceType: LockResourceType,
    public readonly resourceId: string,
    public readonly lockedByType: ActorType,
    public readonly lockedById: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "resource_lock.acquired";
  }
}

export class LockReleased extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly lockId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "resource_lock.released";
  }
}

export class LockForceReleased extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly lockId: string,
    public readonly forcedByType: ActorType,
    public readonly forcedById: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "resource_lock.force_released";
  }
}
