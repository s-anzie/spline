import { DomainEvent } from "./domain-event";

/**
 * Base class for concrete events. The occurrence time is a required
 * constructor argument — handed down from the injected Clock — so
 * `new Date()` can never silently leak into the domain. The date is
 * copied: mutating the input afterwards cannot rewrite history.
 */
export abstract class BaseDomainEvent implements DomainEvent {
  abstract readonly eventName: string;
  readonly occurredAt: Date;
  readonly workspaceId: string | null;

  constructor(
    readonly aggregateId: string,
    occurredAt: Date,
    workspaceId: string | null = null,
  ) {
    this.occurredAt = new Date(occurredAt);
    this.workspaceId = workspaceId;
  }
}
