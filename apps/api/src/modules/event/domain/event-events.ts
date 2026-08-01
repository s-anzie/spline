import { DomainEvent } from "../../../kernel/domain/domain-event";

export class EventRecorded extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly journalEventId: string,
    public readonly type: string,
    public readonly severity: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "event.recorded";
  }
}
