import { ActorType, TaskStatus } from "@repo/db";

import { DomainEvent } from "../../../kernel/domain/domain-event";

export class TaskCreated extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly taskId: string,
    public readonly goalId: string | undefined,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "task.created";
  }
}

export class TaskStatusChanged extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly taskId: string,
    public readonly from: TaskStatus,
    public readonly to: TaskStatus,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "task.status_changed";
  }
}

export class TaskCompleted extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly taskId: string,
    public readonly goalId: string | undefined,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "task.completed";
  }
}

export class TaskAssigned extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly taskId: string,
    public readonly assigneeType: ActorType,
    public readonly assigneeId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "task.assigned";
  }
}

export class TaskBlocked extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly taskId: string,
    public readonly reason: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "task.blocked";
  }
}
