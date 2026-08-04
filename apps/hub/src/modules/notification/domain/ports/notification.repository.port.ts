import { ActorRef } from "../../../identity/domain/actor";
import { NotificationRecipient } from "../notification-recipient";
import { Notification, NotificationKind } from "../notification";

export interface ListNotificationsFilter {
  /** Mandatory (§4.2): there is no unscoped listing of notifications. */
  workspaceId: string;
  kind?: NotificationKind;
  taskId?: string;
  limit?: number;
}

export interface NotificationRepository {
  /**
   * Writes the notification AND its recipients in one go. §4.19 requires the
   * fan-out to exist the moment the notification does; two independent writes
   * would allow a message addressed to nobody to survive a crash.
   */
  create(
    notification: Notification,
    recipients: readonly NotificationRecipient[],
  ): Promise<void>;
  findById(id: string): Promise<Notification | null>;
  list(filter: ListNotificationsFilter): Promise<Notification[]>;
}
export const NOTIFICATION_REPOSITORY = "notification/NotificationRepository";

export interface UnreadForActor {
  recipient: NotificationRecipient;
  notification: Notification;
}

export interface NotificationRecipientRepository {
  save(recipient: NotificationRecipient): Promise<void>;
  /**
   * `workspaceId` is part of the lookup, not a courtesy: a recipient row has
   * no workspace of its own, it inherits its notification's. Filtering on the
   * actor alone would mix workspaces and keep answering after a membership is
   * revoked — the mistake made on event receipts (kernel/doc.md §5.1).
   */
  findByNotificationAndActor(
    workspaceId: string,
    notificationId: string,
    actor: ActorRef,
  ): Promise<NotificationRecipient | null>;
  /** §20.4 / §26 — everything this actor has not laid eyes on, in ONE workspace. */
  listUnread(workspaceId: string, actor: ActorRef): Promise<UnreadForActor[]>;
  listByNotification(
    workspaceId: string,
    notificationId: string,
  ): Promise<NotificationRecipient[]>;
}
export const NOTIFICATION_RECIPIENT_REPOSITORY =
  "notification/NotificationRecipientRepository";
