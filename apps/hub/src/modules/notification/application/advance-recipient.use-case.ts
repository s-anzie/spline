import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { DeliveryStatus } from "../domain/notification-recipient";
import { NotificationRecipientNotFoundError } from "../domain/notification.errors";
import {
  NOTIFICATION_RECIPIENT_REPOSITORY,
  NotificationRecipientRepository,
} from "../domain/ports/notification.repository.port";

export interface AdvanceRecipientInput {
  workspaceId: string;
  notificationId: string;
  actorType: ActorType;
  actorId: string;
  status: DeliveryStatus;
  failureReason?: string;
}

export type AdvanceRecipientError =
  | GuardViolation
  | NotificationRecipientNotFoundError
  | InvalidStateTransitionError;

/**
 * An actor declares, for their own row, that they saw / acknowledged / acted.
 * The lookup is by (workspace, notification, actor): nobody advances someone
 * else's row, and a row from another workspace is simply not found.
 */
@Injectable()
export class AdvanceRecipientUseCase
  implements UseCase<AdvanceRecipientInput, Result<void, AdvanceRecipientError>>
{
  constructor(
    @Inject(NOTIFICATION_RECIPIENT_REPOSITORY)
    private readonly recipients: NotificationRecipientRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: AdvanceRecipientInput,
  ): Promise<Result<void, AdvanceRecipientError>> {
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }
    const recipient = await this.recipients.findByNotificationAndActor(
      input.workspaceId,
      input.notificationId,
      actor.value,
    );
    if (!recipient) {
      return Result.fail(
        new NotificationRecipientNotFoundError(input.notificationId),
      );
    }

    const now = this.clock.now();
    const advanced =
      input.status === "FAILED"
        ? recipient.fail(input.failureReason ?? "delivery failed", now)
        : recipient.advanceTo(input.status, now);
    if (advanced.isFailure) {
      return Result.fail(advanced.error);
    }

    await this.recipients.save(recipient);
    await flushDomainEvents(recipient, this.publisher);
    return Result.ok(undefined);
  }
}
