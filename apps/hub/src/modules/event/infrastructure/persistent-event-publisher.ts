import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { DomainEvent } from "../../../kernel/domain/domain-event";
import { EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Event } from "../domain/event";
import {
  EVENT_REPOSITORY,
  EventRepository,
} from "../domain/ports/event.repository.port";

/**
 * Closes the durability debt named in the kernel and task docs: facts were
 * emitted into an in-memory bus and vanished on restart.
 *
 * Writes first, then emits in process — so a reaction always runs on a fact
 * that is already on record, and a reaction lost to a crash can be found
 * again in the journal (§14.1, §14.5).
 *
 * What it does NOT claim: atomicity with the aggregate write. The event is
 * written after `repository.save()`, in a separate transaction, so a process
 * dying between the two still loses the fact. That is the residual gap
 * documented in the module's doc.md §1.7 — closing it needs the event insert
 * to share the repository's transaction.
 */
@Injectable()
export class PersistentEventPublisher implements EventPublisher {
  private readonly logger = new Logger(PersistentEventPublisher.name);

  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    private readonly emitter: EventEmitter2,
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    const projected = Event.fromDomainEvent(event, 0n);
    if (projected.isFailure) {
      // A naming slip must not break reactions that already work; it just
      // does not enter a journal whose shape assumes "<category>.<fact>".
      this.logger.warn(
        `Not journalled: ${projected.error.message}. The fact is still emitted in process.`,
      );
    } else {
      await this.events.append(projected.value);
    }
    this.emitter.emit(event.eventName, event);
  }

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
