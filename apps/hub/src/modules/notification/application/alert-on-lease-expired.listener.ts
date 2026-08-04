import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { LockLeaseExpired } from "../../lock/domain/resource-lock";
import { SendNotificationUseCase } from "./send-notification.use-case";

/**
 * §17.9 lists "Lease Expired" among the alerts. The recipient needs no
 * policy: the actor who held the lock is the one who cannot possibly work it
 * out alone — everyone else finds the resource free, which is the normal
 * state of affairs.
 */
@Injectable()
export class AlertOnLeaseExpiredListener {
  private readonly logger = new Logger(AlertOnLeaseExpiredListener.name);

  constructor(private readonly send: SendNotificationUseCase) {}

  @OnEvent("lock.lease_expired")
  async handle(event: LockLeaseExpired): Promise<void> {
    if (event.workspaceId === null) {
      return;
    }

    const sent = await this.send.execute({
      workspaceId: event.workspaceId,
      kind: "SYSTEM_ALERT",
      scope: "DIRECT",
      title: `Lease expired: ${event.resourceType}:${event.resourceId}`,
      body: `Your lock on ${event.resourceType}:${event.resourceId} ran out and the resource is free again.`,
      createdByType: "SERVICE",
      createdById: "spline",
      recipients: [{ actorType: event.owner.type, actorId: event.owner.actorId }],
      payload: { resourceType: event.resourceType, resourceId: event.resourceId },
    });

    if (sent.isFailure) {
      this.logger.error(
        `Holder not alerted for expired lease on ${event.resourceType}:${event.resourceId}: ${sent.error.name}`,
      );
    }
  }
}
