import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Notification } from "../../domain/notification";
import { NotificationRepository } from "../../domain/ports/notification.repository.port";

export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly notifications = new Map<string, Notification>();

  async save(notification: Notification): Promise<void> {
    this.notifications.set(notification.id.toString(), notification);
  }

  async findById(id: UniqueEntityId): Promise<Notification | null> {
    return this.notifications.get(id.toString()) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<Notification[]> {
    return [...this.notifications.values()].filter((n) => n.workspaceId === workspaceId);
  }
}
