import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { ActorRef } from "../../identity/domain/actor";
import { TaskStatus } from "./task";

export class TaskCreated extends BaseDomainEvent {
  readonly eventName = "task.created";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly goalId: string,
    readonly assignee: ActorRef,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class TaskUpdated extends BaseDomainEvent {
  readonly eventName = "task.updated";

  constructor(aggregateId: string, occurredAt: Date, workspaceId: string) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class TaskAssigned extends BaseDomainEvent {
  readonly eventName = "task.assigned";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly assignee: ActorRef,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class TaskStatusChanged extends BaseDomainEvent {
  readonly eventName = "task.status_changed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly goalId: string,
    readonly from: TaskStatus,
    readonly to: TaskStatus,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class TaskBlockerReported extends BaseDomainEvent {
  readonly eventName = "task.blocker_reported";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly blockerId: string,
    readonly blockerType: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class TaskBlockerResolved extends BaseDomainEvent {
  readonly eventName = "task.blocker_resolved";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly blockerId: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class TaskDependencyAdded extends BaseDomainEvent {
  readonly eventName = "task.dependency_added";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly dependsOnTaskId: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class TaskDependencyRemoved extends BaseDomainEvent {
  readonly eventName = "task.dependency_removed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly dependsOnTaskId: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}
