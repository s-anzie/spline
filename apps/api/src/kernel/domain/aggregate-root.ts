import { DomainEvent } from "./domain-event";
import { Entity } from "./entity";

export abstract class AggregateRoot<Props> extends Entity<Props> {
  private domainEventList: DomainEvent[] = [];

  get domainEvents(): readonly DomainEvent[] {
    return [...this.domainEventList];
  }

  protected record(event: DomainEvent): void {
    this.domainEventList.push(event);
  }

  clearEvents(): void {
    this.domainEventList = [];
  }
}
