import { DomainEvent } from "../../../kernel/domain/domain-event";

export class WorkspaceCreated extends DomainEvent {
  constructor(workspaceId: string) {
    super(workspaceId);
  }

  get eventName(): string {
    return "workspace.created";
  }
}

export class WorkspaceArchived extends DomainEvent {
  constructor(workspaceId: string) {
    super(workspaceId);
  }

  get eventName(): string {
    return "workspace.archived";
  }
}
