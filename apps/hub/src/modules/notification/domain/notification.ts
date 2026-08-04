import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

/**
 * §4.18 unifies chat and alerts on one model — the v1 decision restored in
 * v3. A message between agents and a "worker offline" alert share the
 * fan-out, the read state and the acknowledgement; two parallel
 * implementations would be the same bug written twice.
 */
export const NOTIFICATION_KINDS = ["CHAT_MESSAGE", "SYSTEM_ALERT"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_SCOPES = ["DIRECT", "BROADCAST"] as const;
export type NotificationScope = (typeof NOTIFICATION_SCOPES)[number];

export class NotificationSent extends BaseDomainEvent {
  readonly eventName = "notification.sent";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly kind: NotificationKind,
    readonly scope: NotificationScope,
    readonly title: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface NotificationProps {
  workspaceId: string;
  kind: NotificationKind;
  scope: NotificationScope;
  taskId: string | null;
  fromActor: ActorRef | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  createdBy: ActorRef;
  createdAt: Date;
}

export interface SendNotificationProps {
  workspaceId: string;
  kind: NotificationKind;
  scope: NotificationScope;
  title: string;
  body: string;
  createdBy: ActorRef;
  now: Date;
  taskId?: string | null;
  /**
   * §4.18 names this `from_agent_id`; it is an ActorRef here because humans
   * write too, and the system alerts without being an agent. Restricting the
   * sender to agents would force a second field on the first human message.
   */
  fromActor?: ActorRef | null;
  payload?: Record<string, unknown>;
}

/**
 * The addressed channel (§5.13). Immutable once sent — like Event and
 * Decision: a sent message is not edited, it is answered.
 */
export class Notification extends AggregateRoot<NotificationProps> {
  static send(
    input: SendNotificationProps,
    id?: UniqueEntityId,
  ): Result<Notification, GuardViolation> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const title = Guard.againstEmpty(input.title, "title");
    if (title.isFailure) {
      return Result.fail(title.error);
    }
    const body = Guard.againstEmpty(input.body, "body");
    if (body.isFailure) {
      return Result.fail(body.error);
    }

    const notification = new Notification(
      {
        workspaceId: workspaceId.value,
        kind: input.kind,
        scope: input.scope,
        taskId: input.taskId ?? null,
        fromActor: input.fromActor ?? null,
        title: title.value,
        body: body.value,
        payload: input.payload ?? {},
        createdBy: input.createdBy,
        createdAt: input.now,
      },
      id,
    );
    notification.addDomainEvent(
      new NotificationSent(
        notification.id.value,
        input.now,
        workspaceId.value,
        input.kind,
        input.scope,
        title.value,
      ),
    );
    return Result.ok(notification);
  }

  /** Rebuild from persistence — never raises events. */
  static reconstitute(props: NotificationProps, id: string): Notification {
    return new Notification(props, new UniqueEntityId(id));
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

  get taskId(): string | null {
    return this.props.taskId;
  }

  get fromActor(): ActorRef | null {
    return this.props.fromActor;
  }

  get title(): string {
    return this.props.title;
  }

  get body(): string {
    return this.props.body;
  }

  get payload(): Record<string, unknown> {
    return this.props.payload;
  }

  get createdBy(): ActorRef {
    return this.props.createdBy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
