import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { PolicyViolated } from "../../policy/application/report-violation.use-case";
import { SendNotificationUseCase } from "./send-notification.use-case";

/**
 * §12.5 requires a violation to generate a Notification, and §17.9 lists
 * "Policy Violation" among the alerts. Recipient determined by the fact: the
 * actor whose action was refused is the one who has to change course.
 */
@Injectable()
export class AlertOnPolicyViolatedListener {
  private readonly logger = new Logger(AlertOnPolicyViolatedListener.name);

  constructor(private readonly send: SendNotificationUseCase) {}

  @OnEvent("policy.violated")
  async handle(event: PolicyViolated): Promise<void> {
    if (event.workspaceId === null) {
      return;
    }

    const sent = await this.send.execute({
      workspaceId: event.workspaceId,
      kind: "SYSTEM_ALERT",
      scope: "DIRECT",
      title: `Denied by policy: ${event.rule}`,
      body: `${event.action} was refused. ${event.detail}`,
      createdByType: "SERVICE",
      createdById: "spline",
      recipients: [
        { actorType: event.attemptedBy.type, actorId: event.attemptedBy.actorId },
      ],
      payload: {
        policyId: event.aggregateId,
        rule: event.rule,
        scopeType: event.scopeType,
      },
    });

    if (sent.isFailure) {
      this.logger.error(
        `Actor not alerted for policy violation ${event.rule}: ${sent.error.name} — ${sent.error.message}`,
      );
    }
  }
}
