import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import {
  EffectivePolicy,
  PolicyContext,
  resolveEffectivePolicies,
} from "../domain/policy-resolver";
import {
  POLICY_REPOSITORY,
  PolicyRepository,
} from "../domain/ports/policy.repository.port";

/** §12.2 — what actually applies here, and which rule decided it (§17.8). */
@Injectable()
export class ResolveEffectivePoliciesUseCase
  implements UseCase<PolicyContext, Result<EffectivePolicy[], GuardViolation>>
{
  constructor(
    @Inject(POLICY_REPOSITORY) private readonly policies: PolicyRepository,
  ) {}

  async execute(
    context: PolicyContext,
  ): Promise<Result<EffectivePolicy[], GuardViolation>> {
    const workspaceId = Guard.againstEmpty(context.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const declared = await this.policies.list({ workspaceId: workspaceId.value });
    const effective = resolveEffectivePolicies(declared, {
      ...context,
      workspaceId: workspaceId.value,
    });
    return Result.ok([...effective.values()]);
  }
}
