import { DomainEvent } from "../domain/domain-event";
import { EventPublisher } from "../domain/ports/event-publisher.port";

/** Captures published events so tests can assert on them. */
export class FakeEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];

  publish(event: DomainEvent): void {
    this.published.push(event);
  }

  publishAll(events: readonly DomainEvent[]): void {
    this.published.push(...events);
  }
}
