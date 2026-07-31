import { ActorType } from "@repo/db";

import { DomainEvent } from "../../../kernel/domain/domain-event";

export class DecisionRecorded extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly decisionId: string,
    public readonly subject: string,
    public readonly decidedByType: ActorType,
    public readonly decidedById: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "decision.recorded";
  }
}
