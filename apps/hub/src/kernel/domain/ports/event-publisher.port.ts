import { DomainEvent } from "../domain-event";

/**
 * Publishing is asynchronous because a durable implementation has to write
 * before it emits (§14.1). A `void` signature could only satisfy that by
 * discarding errors — losing a fact silently is precisely what the Event Bus
 * exists to prevent.
 */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: readonly DomainEvent[]): Promise<void>;
}

export const EVENT_PUBLISHER = "kernel/EventPublisher";
