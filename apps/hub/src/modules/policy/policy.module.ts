import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { LOCK_TTL_POLICY } from "../lock/domain/ports/lock-ttl-policy.port";
import { MANDATED_VALIDATIONS } from "../validation/domain/ports/mandated-validations.port";
import { WorkspaceModule } from "../workspace/workspace.module";
import { DisablePolicyUseCase } from "./application/disable-policy.use-case";
import { ListPoliciesUseCase } from "./application/list-policies.use-case";
import { ReportViolationUseCase } from "./application/report-violation.use-case";
import { ResolveEffectivePoliciesUseCase } from "./application/resolve-effective-policies.use-case";
import { SetPolicyUseCase } from "./application/set-policy.use-case";
import { POLICY_REPOSITORY } from "./domain/ports/policy.repository.port";
import { PolicyLockTtl } from "./infrastructure/policy-lock-ttl.adapter";
import { PolicyMandatedValidations } from "./infrastructure/policy-mandated-validations.adapter";
import { PrismaPolicyRepository } from "./infrastructure/prisma-policy.repository";
import { PolicyController } from "./interface/policy.controller";

/**
 * Imported by ValidationModule for MANDATED_VALIDATIONS. No cycle: policy
 * knows nothing of validation beyond the port validation declares.
 */
@Module({
  imports: [IdentityModule, WorkspaceModule],
  controllers: [PolicyController],
  providers: [
    { provide: POLICY_REPOSITORY, useClass: PrismaPolicyRepository },
    { provide: MANDATED_VALIDATIONS, useClass: PolicyMandatedValidations },
    { provide: LOCK_TTL_POLICY, useClass: PolicyLockTtl },
    SetPolicyUseCase,
    DisablePolicyUseCase,
    ListPoliciesUseCase,
    ResolveEffectivePoliciesUseCase,
    ReportViolationUseCase,
  ],
  exports: [
    MANDATED_VALIDATIONS,
    LOCK_TTL_POLICY,
    ResolveEffectivePoliciesUseCase,
    ReportViolationUseCase,
  ],
})
export class PolicyModule {}
