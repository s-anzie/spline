import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { AUDIT_TRAIL, AuditTrail } from "../../../kernel/domain/ports/audit-trail.port";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import { WorkspaceNotFoundError } from "../../workspace/domain/workspace.errors";
import { Policy, PolicyScopeType, PolicyType } from "../domain/policy";
import {
  POLICY_REPOSITORY,
  PolicyRepository,
} from "../domain/ports/policy.repository.port";

export interface SetPolicyInput {
  workspaceId: string;
  scopeType: PolicyScopeType;
  scopeId: string;
  type: PolicyType;
  rule: string;
  value: unknown;
  actorType: ActorType;
  actorId: string;
}

export type SetPolicyError = GuardViolation | WorkspaceNotFoundError;

/**
 * Setting a rule at a scope. Re-setting the same rule at the same scope
 * replaces its value rather than creating a rival row: two enabled policies
 * for one rule at one level would make the resolution depend on which was
 * loaded first, which is exactly what §12.2 rules out.
 */
@Injectable()
export class SetPolicyUseCase
  implements UseCase<SetPolicyInput, Result<{ policyId: string }, SetPolicyError>>
{
  constructor(
    @Inject(POLICY_REPOSITORY) private readonly policies: PolicyRepository,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(
    input: SetPolicyInput,
  ): Promise<Result<{ policyId: string }, SetPolicyError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    const now = this.clock.now();
    const existing = await this.policies.findAtScope(
      input.workspaceId,
      input.scopeType,
      input.scopeId,
      input.rule,
    );
    if (existing) {
      // Captured before the mutation — the previous value is exactly what an
      // Event cannot carry, and what §18.7's "Policy Update" is about.
      const previousValue = existing.value;
      existing.changeValue(input.value, now);
      await this.policies.save(existing);
      await flushDomainEvents(existing, this.publisher);
      await this.audit.record({
        workspaceId: input.workspaceId,
        actor: actor.value,
        action: "policy.updated",
        targetType: "policy",
        targetId: existing.id.value,
        before: { rule: existing.rule, value: previousValue },
        after: { rule: existing.rule, value: input.value },
      });
      return Result.ok({ policyId: existing.id.value });
    }

    const policy = Policy.set({
      workspaceId: input.workspaceId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      type: input.type,
      rule: input.rule,
      value: input.value,
      createdBy: actor.value,
      now,
    });
    if (policy.isFailure) {
      return Result.fail(policy.error);
    }
    await this.policies.save(policy.value);
    await flushDomainEvents(policy.value, this.publisher);
    await this.audit.record({
      workspaceId: input.workspaceId,
      actor: actor.value,
      action: "policy.updated",
      targetType: "policy",
      targetId: policy.value.id.value,
      // A creation has no before: that is a fact about it, not a gap.
      before: null,
      after: { rule: input.rule, value: input.value, scopeType: input.scopeType },
    });
    return Result.ok({ policyId: policy.value.id.value });
  }
}
