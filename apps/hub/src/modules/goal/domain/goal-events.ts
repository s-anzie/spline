import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { GoalStatus } from "./goal";

export class GoalCreated extends BaseDomainEvent {
  readonly eventName = "goal.created";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly workspaceId: string,
    readonly parentGoalId: string | null,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class GoalUpdated extends BaseDomainEvent {
  readonly eventName = "goal.updated";
}

export class GoalStatusChanged extends BaseDomainEvent {
  readonly eventName = "goal.status_changed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly from: GoalStatus,
    readonly to: GoalStatus,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class GoalProgressUpdated extends BaseDomainEvent {
  readonly eventName = "goal.progress_updated";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly progress: number,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class GoalDependencyAdded extends BaseDomainEvent {
  readonly eventName = "goal.dependency_added";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly dependsOnGoalId: string,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class GoalDependencyRemoved extends BaseDomainEvent {
  readonly eventName = "goal.dependency_removed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly dependsOnGoalId: string,
  ) {
    super(aggregateId, occurredAt);
  }
}
