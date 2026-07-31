import { GoalStatus } from "@repo/db";

import { DomainEvent } from "../../../kernel/domain/domain-event";

export class GoalCreated extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly goalId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "goal.created";
  }
}

export class GoalStatusChanged extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly goalId: string,
    public readonly from: GoalStatus,
    public readonly to: GoalStatus,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "goal.status_changed";
  }
}

export class GoalProgressChanged extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly goalId: string,
    public readonly progressPercentage: number,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "goal.progress_changed";
  }
}

export class GoalBlocked extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly goalId: string,
    public readonly reason: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "goal.blocked";
  }
}
