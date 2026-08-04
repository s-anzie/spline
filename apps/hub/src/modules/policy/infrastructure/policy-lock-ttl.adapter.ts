import { Injectable } from "@nestjs/common";

import { LockTtlPolicyPort } from "../../lock/domain/ports/lock-ttl-policy.port";
import { ResolveEffectivePoliciesUseCase } from "../application/resolve-effective-policies.use-case";

/** The rule name §12.1's "limites" is expressed with for locks. */
export const MAX_LOCK_TTL_RULE = "max_lock_ttl_ms";

/**
 * Supplies the lock module's own abstraction (§DIP): lock owns the need,
 * policy owns the rule. Nothing in lock/ imports policy/.
 */
@Injectable()
export class PolicyLockTtl implements LockTtlPolicyPort {
  constructor(private readonly resolve: ResolveEffectivePoliciesUseCase) {}

  async maxTtlMsFor(workspaceId: string): Promise<number | null> {
    const resolved = await this.resolve.execute({ workspaceId });
    if (resolved.isFailure) {
      return null;
    }
    const rule = resolved.value.find((policy) => policy.rule === MAX_LOCK_TTL_RULE);
    // Declarative values come from Json: a malformed rule must neither cap at
    // a nonsense value nor break an acquisition. It simply does not apply.
    return typeof rule?.value === "number" && rule.value > 0 ? rule.value : null;
  }
}
