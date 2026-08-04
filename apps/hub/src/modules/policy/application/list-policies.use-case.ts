import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { Policy } from "../domain/policy";
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
