import { NotificationKind, NotificationScope } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ListAgentsByWorkspaceUseCase } from "../../agent/application/list-agents-by-workspace.use-case";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Notification, NotificationCreatorRef } from "../domain/notification";
import { EmptyNotificationBodyError } from "../domain/notification.errors";
import { NotificationRecipient, Recipient } from "../domain/notification-recipient";
import {
  NOTIFICATION_RECIPIENT_REPOSITORY,
  NotificationRecipientRepository,
} from "../domain/ports/notification-recipient.repository.port";
import { NOTIFICATION_REPOSITORY, NotificationRepository } from "../domain/ports/notification.repository.port";
import { EmptyDirectRecipientsError } from "./notification-application.errors";

export interface SendNotificationInput {
  workspaceId: string;
  kind: NotificationKind;
  scope: NotificationScope;
  taskId?: string;
  title?: string;
  body: string;
  payload?: Record<string, unknown>;
  linkedEventId?: string;
  createdBy: NotificationCreatorRef;
  /** Required (and must be non-empty) when scope is DIRECT; ignored for BROADCAST, which resolves recipients itself. */
  recipients?: Recipient[];
}

export interface SendNotificationOutput {
  notification: Notification;
  recipients: NotificationRecipient[];
}

export type SendNotificationError = WorkspaceNotFoundError | EmptyNotificationBodyError | EmptyDirectRecipientsError;

@Injectable()
export class SendNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
    @Inject(NOTIFICATION_RECIPIENT_REPOSITORY) private readonly recipientRepo: NotificationRecipientRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly listAgentsByWorkspace: ListAgentsByWorkspaceUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: SendNotificationInput): Promise<Result<SendNotificationOutput, SendNotificationError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    if (input.scope === "DIRECT" && (!input.recipients || input.recipients.length === 0)) {
      return Result.fail(new EmptyDirectRecipientsError());
    }

    const now = this.clock.now();
    let notification: Notification;
    try {
      notification = Notification.send(input, now);
    } catch (error) {
      if (error instanceof EmptyNotificationBodyError) {
        return Result.fail(error);
      }
      throw error;
    }
    await this.notifications.save(notification);

    const resolvedRecipients = await this.resolveRecipients(input);
    const recipients: NotificationRecipient[] = [];
    for (const recipient of resolvedRecipients) {
      const notificationRecipient = NotificationRecipient.resolve({
        notificationId: notification.id.toString(),
        recipient,
      });
      await this.recipientRepo.save(notificationRecipient);
      recipients.push(notificationRecipient);
    }

    this.eventPublisher.publishAll(notification.domainEvents);
    notification.clearEvents();

    return Result.ok({ notification, recipients });
  }

  private async resolveRecipients(input: SendNotificationInput): Promise<Recipient[]> {
    if (input.scope === "BROADCAST") {
      const agents = await this.listAgentsByWorkspace.execute(input.workspaceId);
      return agents.filter((agent) => !agent.isDisabled).map((agent) => ({ type: "AGENT" as const, id: agent.id.toString() }));
    }
    return input.recipients ?? [];
  }
}
