import { DomainEvent } from "../domain/domain-event";
import { EventPublisher } from "../domain/ports/event-publisher.port";

export class FakeEventPublisher implements EventPublisher {
  public readonly published: DomainEvent[] = [];

  publish(event: DomainEvent): void {
    this.published.push(event);
  }

  publishAll(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.publish(event);
    }
  }
}
