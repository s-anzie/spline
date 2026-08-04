import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { DomainEvent } from "../domain/domain-event";
import { EventPublisher } from "../domain/ports/event-publisher.port";

@Injectable()
export class EventEmitterEventPublisher implements EventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(event: DomainEvent): void {
    this.emitter.emit(event.eventName, event);
  }

  publishAll(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.publish(event);
    }
  }
}
