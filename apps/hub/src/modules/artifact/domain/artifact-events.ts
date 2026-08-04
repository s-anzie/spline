import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { ArtifactStatus } from "./artifact";

export class ArtifactCreated extends BaseDomainEvent {
  readonly eventName = "artifact.created";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly workspaceId: string,
    readonly type: string,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class ArtifactVersioned extends BaseDomainEvent {
  readonly eventName = "artifact.versioned";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly version: number,
    readonly checksum: string,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class ArtifactUpdated extends BaseDomainEvent {
  readonly eventName = "artifact.updated";
}

export class ArtifactLinked extends BaseDomainEvent {
  readonly eventName = "artifact.linked";
}

export class ArtifactUnlinked extends BaseDomainEvent {
  readonly eventName = "artifact.unlinked";
}

export class ArtifactStatusChanged extends BaseDomainEvent {
  readonly eventName = "artifact.status_changed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly workspaceId: string,
    readonly from: ArtifactStatus,
    readonly to: ArtifactStatus,
  ) {
    super(aggregateId, occurredAt);
  }
}
