import { NotificationDeliveryStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
import { NotificationRecipient, Recipient } from "../domain/notification-recipient";
import {
  NOTIFICATION_RECIPIENT_REPOSITORY,
  NotificationRecipientRepository,
} from "../domain/ports/notification-recipient.repository.port";
import { NotificationRecipientNotFoundError } from "./notification-application.errors";

export interface AdvanceNotificationRecipientInput {
  notificationId: string;
  actor: Recipient;
  status: NotificationDeliveryStatus;
}

/** Always the CALLER's own recipient row — looked up by (notification, actor), never a raw recipient-row id from the client. */
@Injectable()
export class AdvanceNotificationRecipientUseCase {
  constructor(
    @Inject(NOTIFICATION_RECIPIENT_REPOSITORY) private readonly recipients: NotificationRecipientRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: AdvanceNotificationRecipientInput,
  ): Promise<Result<NotificationRecipient, NotificationRecipientNotFoundError>> {
    const recipient = await this.recipients.findByNotificationAndRecipient(
      input.notificationId,
      input.actor.type,
      input.actor.id,
    );
    if (!recipient) {
      return Result.fail(new NotificationRecipientNotFoundError(`${input.notificationId}:${input.actor.id}`));
    }

    recipient.advanceTo(input.status, this.clock.now());
    await this.recipients.save(recipient);

    return Result.ok(recipient);
  }
}
