import { Inject, Injectable } from "@nestjs/common";

import { Event } from "../domain/event";
import { EVENT_REPOSITORY, EventRepository } from "../domain/ports/event.repository.port";

@Injectable()
export class ListEventsByWorkspaceUseCase {
  constructor(@Inject(EVENT_REPOSITORY) private readonly events: EventRepository) {}

  async execute(workspaceId: string): Promise<Event[]> {
    return this.events.listByWorkspace(workspaceId);
  }
}
