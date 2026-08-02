import { DomainEvent } from "../../../kernel/domain/domain-event";

export class SessionOutputAppendedEvent extends DomainEvent {
  readonly eventName = "session.output";

  constructor(
    workspaceId: string,
    public readonly output: {
      id: string;
      sessionId: string;
      sequence: number;
      stream: "STDOUT" | "STDERR";
      content: string;
      createdAt: string;
    },
  ) {
    super(workspaceId);
  }
}
