import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { Policy } from "../domain/policy";
import { PolicyNotFoundError } from "../domain/policy.errors";
import {
  ListPoliciesFilter,
  POLICY_REPOSITORY,
  PolicyRepository,
} from "../domain/ports/policy.repository.port";

/** The declared rules of one workspace — never of several (§4.2). */
@Injectable()
export class ListPoliciesUseCase
  implements UseCase<ListPoliciesFilter, Result<Policy[], GuardViolation>>
{
  constructor(
    @Inject(POLICY_REPOSITORY) private readonly policies: PolicyRepository,
  ) {}

  async execute(filter: ListPoliciesFilter): Promise<Result<Policy[], GuardViolation>> {
    const workspaceId = Guard.againstEmpty(filter.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    return Result.ok(
      await this.policies.list({ ...filter, workspaceId: workspaceId.value }),
    );
  }
}

/**
 * An identifier the API hands out must be resolvable through the API. This
 * one is: `/effective` reports which policy decided each rule
 * (§17.8), and a caller shown `decidedBy.policyId` could not fetch it.
 */
@Injectable()
export class GetPolicyUseCase
  implements
    UseCase<{ workspaceId: string; policyId: string }, Result<Policy, PolicyNotFoundError>>
{
  constructor(
    @Inject(POLICY_REPOSITORY) private readonly policies: PolicyRepository,
  ) {}

  async execute(input: {
    workspaceId: string;
    policyId: string;
  }): Promise<Result<Policy, PolicyNotFoundError>> {
    const policy = await this.policies.findById(input.policyId);
    if (!policy || policy.workspaceId !== input.workspaceId) {
      return Result.fail(new PolicyNotFoundError(input.policyId));
    }
    return Result.ok(policy);
  }
}
