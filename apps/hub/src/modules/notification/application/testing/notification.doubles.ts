import { ActorRef } from "../../../identity/domain/actor";
import { NotificationRecipient } from "../../domain/notification-recipient";
import { Notification } from "../../domain/notification";
import {
  ListNotificationsFilter,
  NotificationRecipientRepository,
  NotificationRepository,
  UnreadForActor,
} from "../../domain/ports/notification.repository.port";
import { WorkspaceAudiencePort } from "../../domain/ports/workspace-audience.port";

export class InMemoryNotificationRepository implements NotificationRepository {
  readonly notifications = new Map<string, Notification>();
  readonly recipients = new Map<string, NotificationRecipient>();

  async create(
    notification: Notification,
    recipients: readonly NotificationRecipient[],
  ): Promise<void> {
    this.notifications.set(notification.id.value, notification);
    for (const recipient of recipients) {
      this.recipients.set(recipient.id.value, recipient);
    }
  }

  async findById(id: string): Promise<Notification | null> {
    return this.notifications.get(id) ?? null;
  }

  async list(filter: ListNotificationsFilter): Promise<Notification[]> {
    return [...this.notifications.values()]
      .filter((notification) => {
        if (notification.workspaceId !== filter.workspaceId) return false;
        if (filter.kind && notification.kind !== filter.kind) return false;
        if (filter.taskId && notification.taskId !== filter.taskId) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filter.limit ?? 100);
  }
}

export class InMemoryNotificationRecipientRepository
  implements NotificationRecipientRepository
{
  /** A recipient inherits its workspace from its notification, so both. */
  constructor(private readonly parent: InMemoryNotificationRepository) {}

  private inWorkspace(recipient: NotificationRecipient, workspaceId: string): boolean {
    return (
      this.parent.notifications.get(recipient.notificationId)?.workspaceId === workspaceId
    );
  }

  async save(recipient: NotificationRecipient): Promise<void> {
    this.parent.recipients.set(recipient.id.value, recipient);
  }

  async findByNotificationAndActor(
    workspaceId: string,
    notificationId: string,
    actor: ActorRef,
  ): Promise<NotificationRecipient | null> {
    for (const recipient of this.parent.recipients.values()) {
      if (recipient.notificationId !== notificationId) continue;
      if (!recipient.recipient.equals(actor)) continue;
      if (!this.inWorkspace(recipient, workspaceId)) continue;
      return recipient;
    }
    return null;
  }

  async listUnread(workspaceId: string, actor: ActorRef): Promise<UnreadForActor[]> {
    const out: UnreadForActor[] = [];
    for (const recipient of this.parent.recipients.values()) {
      if (!recipient.isUnread) continue;
      if (!recipient.recipient.equals(actor)) continue;
      const notification = this.parent.notifications.get(recipient.notificationId);
      if (notification?.workspaceId !== workspaceId) continue;
      out.push({ recipient, notification });
    }
    return out;
  }

  async listByNotification(
    workspaceId: string,
    notificationId: string,
  ): Promise<NotificationRecipient[]> {
    return [...this.parent.recipients.values()].filter(
      (recipient) =>
        recipient.notificationId === notificationId &&
        this.inWorkspace(recipient, workspaceId),
    );
  }
}

export class FakeWorkspaceAudience implements WorkspaceAudiencePort {
  private readonly members = new Map<string, ActorRef[]>();

  set(workspaceId: string, actors: ActorRef[]): void {
    this.members.set(workspaceId, actors);
  }

  async membersOf(workspaceId: string): Promise<ActorRef[]> {
    return this.members.get(workspaceId) ?? [];
  }
}
