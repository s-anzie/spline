/**
 * A fact that already happened, never an intention (v3 spec §4.20).
 * eventName uses dot-separated segments ("workspace.created") so wildcard
 * subscribers can relay whole categories.
 */
export interface DomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
}
