import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { AUDIT_TRAIL, AuditTrail } from "../../../kernel/domain/ports/audit-trail.port";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { PolicyNotFoundError } from "../domain/policy.errors";
import {
  POLICY_REPOSITORY,
  PolicyRepository,
} from "../domain/ports/policy.repository.port";

export interface DisablePolicyInput {
  workspaceId: string;
  policyId: string;
  actorType: ActorType;
  actorId: string;
}

/**
 * Out of the resolution, still on record (§18.7): a rule that governed past
 * decisions has to stay readable to explain them. There is no delete route.
 */
@Injectable()
export class DisablePolicyUseCase
  implements UseCase<DisablePolicyInput, Result<void, PolicyNotFoundError>>
{
  constructor(
    @Inject(POLICY_REPOSITORY) private readonly policies: PolicyRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(input: DisablePolicyInput): Promise<Result<void, PolicyNotFoundError>> {
    const policy = await this.policies.findById(input.policyId);
    if (!policy || policy.workspaceId !== input.workspaceId) {
      return Result.fail(new PolicyNotFoundError(input.policyId));
    }

    policy.disable(this.clock.now());
    await this.policies.save(policy);
    await flushDomainEvents(policy, this.publisher);
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isSuccess) {
      await this.audit.record({
        workspaceId: policy.workspaceId,
        actor: actor.value,
        action: "policy.disabled",
        targetType: "policy",
        targetId: policy.id.value,
        before: { rule: policy.rule, enabled: true },
        after: { rule: policy.rule, enabled: false },
      });
    }
    return Result.ok(undefined);
  }
}
