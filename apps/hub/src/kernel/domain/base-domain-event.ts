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

  constructor(
    readonly aggregateId: string,
    occurredAt: Date,
  ) {
    this.occurredAt = new Date(occurredAt);
  }
}
