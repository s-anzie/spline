import { Injectable } from "@nestjs/common";

import { StalenessThresholdsPort } from "../../observability/domain/ports/staleness-thresholds.port";
import { ResolveEffectivePoliciesUseCase } from "../application/resolve-effective-policies.use-case";

/**
 * Supplies observability's own abstraction (§DIP): §17.7 wants staleness
 * thresholds to be "documentés et ajustables", and §12.1 makes limits a
 * policy's business. Third real consumer of the policy engine, after
 * mandatory validations and the lock TTL ceiling.
 */
@Injectable()
export class PolicyStalenessThresholds implements StalenessThresholdsPort {
  constructor(private readonly resolve: ResolveEffectivePoliciesUseCase) {}

  async thresholdMsFor(workspaceId: string, rule: string): Promise<number | null> {
    const resolved = await this.resolve.execute({ workspaceId });
    if (resolved.isFailure) {
      return null;
    }
    const found = resolved.value.find((policy) => policy.rule === rule);
    // Declarative values come from Json: a malformed rule must neither apply
    // a nonsense window nor break the health read. It simply does not apply.
    return typeof found?.value === "number" && found.value > 0 ? found.value : null;
  }
}
