import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { ArtifactStatus } from "./artifact";

export class ArtifactCreated extends BaseDomainEvent {
  readonly eventName = "artifact.created";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly type: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class ArtifactVersioned extends BaseDomainEvent {
  readonly eventName = "artifact.versioned";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly version: number,
    readonly checksum: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class ArtifactUpdated extends BaseDomainEvent {
  readonly eventName = "artifact.updated";

  constructor(aggregateId: string, occurredAt: Date, workspaceId: string) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class ArtifactLinked extends BaseDomainEvent {
  readonly eventName = "artifact.linked";

  constructor(aggregateId: string, occurredAt: Date, workspaceId: string) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class ArtifactUnlinked extends BaseDomainEvent {
  readonly eventName = "artifact.unlinked";

  constructor(aggregateId: string, occurredAt: Date, workspaceId: string) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class ArtifactStatusChanged extends BaseDomainEvent {
  readonly eventName = "artifact.status_changed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly from: ArtifactStatus,
    readonly to: ArtifactStatus,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}
