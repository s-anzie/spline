import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Event } from "../../domain/event";
import { EventRepository } from "../../domain/ports/event.repository.port";

export class InMemoryEventRepository implements EventRepository {
  private readonly events = new Map<string, Event>();

  async save(event: Event): Promise<void> {
    this.events.set(event.id.toString(), event);
  }

  async findById(id: UniqueEntityId): Promise<Event | null> {
    return this.events.get(id.toString()) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<Event[]> {
    return [...this.events.values()].filter((e) => e.workspaceId === workspaceId);
  }
}
