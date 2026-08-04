import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";

export class DecisionRecorded extends BaseDomainEvent {
  readonly eventName = "decision.recorded";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly taskId: string | null,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class DecisionSuperseded extends BaseDomainEvent {
  readonly eventName = "decision.superseded";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly supersededByDecisionId: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}
