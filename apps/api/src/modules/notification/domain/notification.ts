import { NotificationKind, NotificationScope } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { NotificationSent } from "./notification-events";
import { EmptyNotificationBodyError } from "./notification.errors";

/** Broader than the strict ActorType enum — a system_alert can be created by the system itself, same precedent as Event.actor. */
export type NotificationCreatorType = "HUMAN" | "AGENT" | "SYSTEM";

export interface NotificationCreatorRef {
  type: NotificationCreatorType;
  id: string;
}

export interface NotificationProps {
  workspaceId: string;
  kind: NotificationKind;
  scope: NotificationScope;
  taskId?: string;
  title?: string;
  body: string;
  payload: Record<string, unknown>;
  linkedEventId?: string;
  createdBy: NotificationCreatorRef;
  createdAt: Date;
}

export interface SendNotificationProps {
  workspaceId: string;
  kind: NotificationKind;
  scope: NotificationScope;
  taskId?: string;
  title?: string;
  body: string;
  payload?: Record<string, unknown>;
  linkedEventId?: string;
  createdBy: NotificationCreatorRef;
}

/** The message/alert itself — see NotificationRecipient for per-recipient delivery/read state. */
export class Notification extends AggregateRoot<NotificationProps> {
  static send(props: SendNotificationProps, at: Date = new Date(), id?: UniqueEntityId): Notification {
    const body = props.body.trim();
    if (!body) {
      throw new EmptyNotificationBodyError();
    }

    const notification = new Notification(
      {
        workspaceId: props.workspaceId,
        kind: props.kind,
        scope: props.scope,
        taskId: props.taskId,
        title: props.title,
        body,
        payload: props.payload ?? {},
        linkedEventId: props.linkedEventId,
        createdBy: props.createdBy,
        createdAt: at,
      },
      id,
    );
    notification.record(
      new NotificationSent(
        notification.props.workspaceId,
        notification.id.toString(),
        notification.props.kind,
        notification.props.scope,
      ),
    );
    return notification;
  }

  static reconstitute(props: NotificationProps, id: UniqueEntityId): Notification {
    return new Notification(props, id);
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get kind(): NotificationKind {
    return this.props.kind;
  }

  get scope(): NotificationScope {
    return this.props.scope;
  }

  get taskId(): string | undefined {
    return this.props.taskId;
  }

  get title(): string | undefined {
    return this.props.title;
  }

  get body(): string {
    return this.props.body;
  }

  get payload(): Record<string, unknown> {
    return this.props.payload;
  }

  get linkedEventId(): string | undefined {
    return this.props.linkedEventId;
  }

  get createdBy(): NotificationCreatorRef {
    return this.props.createdBy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
