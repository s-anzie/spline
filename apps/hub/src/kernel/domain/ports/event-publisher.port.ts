import { DomainEvent } from "../domain-event";

export interface EventPublisher {
  publish(event: DomainEvent): void;
  publishAll(events: readonly DomainEvent[]): void;
}

export const EVENT_PUBLISHER = "kernel/EventPublisher";
