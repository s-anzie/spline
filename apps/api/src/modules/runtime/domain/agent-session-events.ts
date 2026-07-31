import { AgentSessionStatus, ApprovalState } from "@repo/db";

import { DomainEvent } from "../../../kernel/domain/domain-event";

export class AgentSessionStarted extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly sessionId: string,
    public readonly agentId: string,
    public readonly machineId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "agent_session.started";
  }
}

export class AgentSessionStatusChanged extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly sessionId: string,
    public readonly from: AgentSessionStatus,
    public readonly to: AgentSessionStatus,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "agent_session.status_changed";
  }
}

export class AgentSessionApprovalStateChanged extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly sessionId: string,
    public readonly from: ApprovalState,
    public readonly to: ApprovalState,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "agent_session.approval_state_changed";
  }
}
