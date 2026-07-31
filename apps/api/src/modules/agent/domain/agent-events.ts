import { AgentHealthState, AgentStatus } from "@repo/db";

import { DomainEvent } from "../../../kernel/domain/domain-event";

export class AgentRegistered extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly agentId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "agent.registered";
  }
}

export class AgentStatusChanged extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly agentId: string,
    public readonly from: AgentStatus,
    public readonly to: AgentStatus,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "agent.status_changed";
  }
}

export class AgentHealthChanged extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly agentId: string,
    public readonly from: AgentHealthState,
    public readonly to: AgentHealthState,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "agent.health_changed";
  }
}

export class AgentAssignedToTask extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly agentId: string,
    public readonly taskId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "agent.assigned_to_task";
  }
}

export class AgentUnassignedFromTask extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly agentId: string,
    public readonly taskId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "agent.unassigned_from_task";
  }
}
