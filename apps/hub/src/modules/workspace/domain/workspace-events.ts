import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { WorkspaceStatus } from "./workspace";

export class WorkspaceCreated extends BaseDomainEvent {
  readonly eventName = "workspace.created";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly organizationId: string,
    readonly slug: string,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class WorkspaceUpdated extends BaseDomainEvent {
  readonly eventName = "workspace.updated";
}

export class WorkspaceStatusChanged extends BaseDomainEvent {
  readonly eventName = "workspace.status_changed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly from: WorkspaceStatus,
    readonly to: WorkspaceStatus,
  ) {
    super(aggregateId, occurredAt);
  }
}
