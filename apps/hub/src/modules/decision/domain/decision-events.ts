import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";

export class DecisionRecorded extends BaseDomainEvent {
  readonly eventName = "decision.recorded";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly workspaceId: string,
    readonly taskId: string | null,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class DecisionSuperseded extends BaseDomainEvent {
  readonly eventName = "decision.superseded";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly supersededByDecisionId: string,
  ) {
    super(aggregateId, occurredAt);
  }
}
