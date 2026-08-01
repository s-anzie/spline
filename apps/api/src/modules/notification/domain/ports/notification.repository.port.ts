import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Notification } from "../notification";

export const NOTIFICATION_REPOSITORY = Symbol("NOTIFICATION_REPOSITORY");

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  findById(id: UniqueEntityId): Promise<Notification | null>;
  listByWorkspace(workspaceId: string): Promise<Notification[]>;
}
