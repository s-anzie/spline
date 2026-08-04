import { DomainEvent } from "../domain/domain-event";
import { EventPublisher } from "../domain/ports/event-publisher.port";

/** Captures published events so tests can assert on them. */
export class FakeEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    this.published.push(...events);
  }
}
