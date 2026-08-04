import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";

export class PolicyViolated extends BaseDomainEvent {
  readonly eventName = "policy.violated";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly rule: string,
    readonly scopeType: string,
    readonly attemptedBy: ActorRef,
    readonly action: string,
    readonly detail: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export interface ReportViolationInput {
  workspaceId: string;
  policyId: string;
  rule: string;
  scopeType: string;
  action: string;
  detail: string;
  attemptedByType: ActorType;
  attemptedById: string;
}

/**
 * §12.5 — "toute violation génère un Event, une entrée Audit, une
 * Notification, et peut suspendre une Session".
 *
 * Two of the four are produced: the Event, and — through it — the
 * Notification, since the notification module listens rather than being
 * called. The other two are named debts, not silently skipped: AuditEntry
 * (§4.23) does not exist, and there is no Session to suspend (§4.12).
 *
 * Callable rather than private, because §12.5 makes reporting a violation the
 * duty of whoever detects one, and the detectors are the Runtime and the
 * Repository Engine — neither of which exists yet.
 */
@Injectable()
export class ReportViolationUseCase
  implements UseCase<ReportViolationInput, Result<void, GuardViolation>>
{
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: ReportViolationInput): Promise<Result<void, GuardViolation>> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const actor = ActorRef.create(input.attemptedByType, input.attemptedById);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    await this.publisher.publish(
      new PolicyViolated(
        input.policyId,
        this.clock.now(),
        workspaceId.value,
        input.rule,
        input.scopeType,
        actor.value,
        input.action,
        input.detail,
      ),
    );
    return Result.ok(undefined);
  }
}
