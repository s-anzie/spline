import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { ValidationFailed } from "../../validation/domain/validation";
import { SendNotificationUseCase } from "./send-notification.use-case";

/**
 * §17.9 lists "Validation Failed" among the alerts, and this is the first of
 * the eight whose producer exists. Its recipient needs no policy: whoever
 * asked for the proof is the one who has to act on its absence.
 *
 * Listening to the fact rather than being called by the Validation module
 * keeps the dependency one-way, exactly as the assignment alert does.
 */
@Injectable()
export class AlertOnValidationFailedListener {
  private readonly logger = new Logger(AlertOnValidationFailedListener.name);

  constructor(private readonly send: SendNotificationUseCase) {}

  @OnEvent("validation.failed")
  async handle(event: ValidationFailed): Promise<void> {
    if (event.workspaceId === null) {
      return;
    }

    const sent = await this.send.execute({
      workspaceId: event.workspaceId,
      kind: "SYSTEM_ALERT",
      scope: "DIRECT",
      title: `Validation failed: ${event.type}`,
      body: event.output ?? `The ${event.type} validation did not pass.`,
      taskId: event.taskId,
      createdByType: "SERVICE",
      createdById: "spline",
      recipients: [
        { actorType: event.requestedBy.type, actorId: event.requestedBy.actorId },
      ],
      payload: { validationId: event.aggregateId, type: event.type },
    });

    // Never discard the Result: a swallowed failure here means nobody learns
    // their work did not pass.
    if (sent.isFailure) {
      this.logger.error(
        `Requester not alerted for validation ${event.aggregateId}: ${sent.error.name} — ${sent.error.message}`,
      );
    }
  }
}
