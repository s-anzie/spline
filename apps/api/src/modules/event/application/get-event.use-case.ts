import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Event } from "../domain/event";
import { EVENT_REPOSITORY, EventRepository } from "../domain/ports/event.repository.port";
import { EventNotFoundError } from "./event-application.errors";

@Injectable()
export class GetEventUseCase {
  constructor(@Inject(EVENT_REPOSITORY) private readonly events: EventRepository) {}

  async execute(eventId: string): Promise<Result<Event, EventNotFoundError>> {
    const event = await this.events.findById(UniqueEntityId.create(eventId));
    if (!event) {
      return Result.fail(new EventNotFoundError(eventId));
    }
    return Result.ok(event);
  }
}
