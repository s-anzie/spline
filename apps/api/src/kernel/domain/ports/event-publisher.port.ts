import { DomainEvent } from "../domain-event";

export const EVENT_PUBLISHER = Symbol("EVENT_PUBLISHER");

export interface EventPublisher {
  publish(event: DomainEvent): void;
  publishAll(events: readonly DomainEvent[]): void;
}
