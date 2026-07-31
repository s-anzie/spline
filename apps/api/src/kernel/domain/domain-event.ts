export abstract class DomainEvent {
  public readonly workspaceId: string;
  public readonly occurredAt: Date;

  protected constructor(workspaceId: string, occurredAt: Date = new Date()) {
    this.workspaceId = workspaceId;
    this.occurredAt = occurredAt;
  }

  abstract get eventName(): string;
}
