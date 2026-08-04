import { DomainEvent } from "../domain/domain-event";
import { EventPublisher } from "../domain/ports/event-publisher.port";

interface EventSource {
  readonly domainEvents: readonly DomainEvent[];
  clearDomainEvents(): void;
}

/**
 * Encodes the mandatory ordering (kernel rule #7): events are published
 * only after successful persistence, then cleared. Use-cases call
 * `repository.save(aggregate)` then `flushDomainEvents(aggregate, publisher)`
 * — never publish by hand, so the order cannot be accidentally inverted.
 */
export async function flushDomainEvents(
  source: EventSource,
  publisher: EventPublisher,
): Promise<void> {
  await publisher.publishAll(source.domainEvents);
  source.clearDomainEvents();
}
