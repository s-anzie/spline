import { ProcessStatus } from "@repo/db";

import { DomainEvent } from "../../../kernel/domain/domain-event";

export class ProcessRegistered extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly processId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "process.registered";
  }
}

export class ProcessStatusChanged extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly processId: string,
    public readonly from: ProcessStatus,
    public readonly to: ProcessStatus,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "process.status_changed";
  }
}
