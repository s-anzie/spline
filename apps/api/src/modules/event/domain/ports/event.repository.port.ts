import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Event } from "../event";

export const EVENT_REPOSITORY = Symbol("EVENT_REPOSITORY");

export interface EventRepository {
  save(event: Event): Promise<void>;
  findById(id: UniqueEntityId): Promise<Event | null>;
  listByWorkspace(workspaceId: string): Promise<Event[]>;
}
