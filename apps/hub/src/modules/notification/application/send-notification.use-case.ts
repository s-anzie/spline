import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { TASK_REPOSITORY, TaskRepository } from "../../task/domain/ports/task.repository.port";
import { TaskNotFoundError } from "../../task/domain/task.errors";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import { WorkspaceNotFoundError } from "../../workspace/domain/workspace.errors";
import { NotificationRecipient } from "../domain/notification-recipient";
import { Notification, NotificationKind, NotificationScope } from "../domain/notification";
import { NoRecipientsError } from "../domain/notification.errors";
import {
  NOTIFICATION_REPOSITORY,
  NotificationRepository,
} from "../domain/ports/notification.repository.port";
import {
  WORKSPACE_AUDIENCE,
  WorkspaceAudiencePort,
} from "../domain/ports/workspace-audience.port";

export interface SendNotificationInput {
  workspaceId: string;
  kind: NotificationKind;
  scope: NotificationScope;
  title: string;
  body: string;
  createdByType: ActorType;
  createdById: string;
  /** Ignored when scope is BROADCAST — the audience is resolved instead. */
  recipients?: readonly { actorType: ActorType; actorId: string }[];
  taskId?: string;
  fromActorType?: ActorType;
  fromActorId?: string;
  payload?: Record<string, unknown>;
}

export type SendNotificationError =
  | GuardViolation
  | WorkspaceNotFoundError
  | TaskNotFoundError
  | NoRecipientsError;

/**
 * §4.19 — the fan-out is resolved and materialised HERE, at creation. A
 * broadcast never survives as the string "all" to be re-interpreted at every
 * read: that is precisely what made `ack` meaningless on broadcasts in the
 * previous tool.
 */
@Injectable()
export class SendNotificationUseCase
  implements
    UseCase<
      SendNotificationInput,
      Result<{ notificationId: string; recipientCount: number }, SendNotificationError>
    >
{
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(WORKSPACE_AUDIENCE) private readonly audience: WorkspaceAudiencePort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: SendNotificationInput,
  ): Promise<
    Result<{ notificationId: string; recipientCount: number }, SendNotificationError>
  > {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }

    // The thread anchor is a real foreign key: a ghost task would be a 500,
    // and a task from another workspace would be a leak (§4.2).
    if (input.taskId !== undefined) {
      const task = await this.tasks.findById(input.taskId);
      if (!task || task.workspaceId !== input.workspaceId) {
        return Result.fail(new TaskNotFoundError(input.taskId));
      }
    }

    const createdBy = ActorRef.create(input.createdByType, input.createdById);
    if (createdBy.isFailure) {
      return Result.fail(createdBy.error);
    }
    let fromActor: ActorRef | null = null;
    if (input.fromActorType !== undefined && input.fromActorId !== undefined) {
      const from = ActorRef.create(input.fromActorType, input.fromActorId);
      if (from.isFailure) {
        return Result.fail(from.error);
      }
      fromActor = from.value;
    }

    const addressees = await this.resolveAudience(input);
    if (addressees.isFailure) {
      return Result.fail(addressees.error);
    }

    const now = this.clock.now();
    const notification = Notification.send({
      workspaceId: input.workspaceId,
      kind: input.kind,
      scope: input.scope,
      title: input.title,
      body: input.body,
      taskId: input.taskId ?? null,
      fromActor,
      payload: input.payload,
      createdBy: createdBy.value,
      now,
    });
    if (notification.isFailure) {
      return Result.fail(notification.error);
    }

    const recipients = addressees.value.map(
      (actor) =>
        NotificationRecipient.address({
          notificationId: notification.value.id.value,
          recipient: actor,
          workspaceId: input.workspaceId,
          now,
        }).value,
    );

    await this.notifications.create(notification.value, recipients);
    await flushDomainEvents(notification.value, this.publisher);
    for (const recipient of recipients) {
      await flushDomainEvents(recipient, this.publisher);
    }

    return Result.ok({
      notificationId: notification.value.id.value,
      recipientCount: recipients.length,
    });
  }

  /**
   * BROADCAST asks identity who is actually there; DIRECT takes the caller's
   * list. Either way the answer is a concrete list of actors before anything
   * is written — never a scope re-interpreted at read time (§4.19).
   */
  private async resolveAudience(
    input: SendNotificationInput,
  ): Promise<Result<ActorRef[], GuardViolation | NoRecipientsError>> {
    const actors: ActorRef[] = [];
    if (input.scope === "BROADCAST") {
      actors.push(...(await this.audience.membersOf(input.workspaceId)));
    } else {
      for (const entry of input.recipients ?? []) {
        const actor = ActorRef.create(entry.actorType, entry.actorId);
        if (actor.isFailure) {
          return Result.fail(actor.error);
        }
        actors.push(actor.value);
      }
    }

    // Addressing the same actor twice must not create two rows to acknowledge.
    const seen = new Set<string>();
    const unique = actors.filter((actor) => {
      const key = `${actor.type}:${actor.actorId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length === 0) {
      return Result.fail(new NoRecipientsError());
    }
    return Result.ok(unique);
  }
}
