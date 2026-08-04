import { DomainEvent } from "./domain-event";
import { Entity } from "./entity";

/**
 * An Entity that records the domain events its behaviour raises. Events are
 * dispatched by the application layer after successful persistence — the
 * aggregate itself never publishes.
 */
export abstract class AggregateRoot<Props> extends Entity<Props> {
  private _domainEvents: DomainEvent[] = [];

  get domainEvents(): readonly DomainEvent[] {
    return [...this._domainEvents];
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
