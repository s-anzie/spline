import { Injectable } from "@nestjs/common";

import { MandatedValidationsPort } from "../../validation/domain/ports/mandated-validations.port";
import { ResolveEffectivePoliciesUseCase } from "../application/resolve-effective-policies.use-case";

/** The rule name §12.3's Validation type is expressed with. */
export const REQUIRED_VALIDATIONS_RULE = "required_validations";

/**
 * Supplies the validation module's own abstraction (§DIP): validation owns
 * the need, policy owns the rule. Nothing in validation/ imports policy/.
 */
@Injectable()
export class PolicyMandatedValidations implements MandatedValidationsPort {
  constructor(private readonly resolve: ResolveEffectivePoliciesUseCase) {}

  async mandatedFor(context: {
    workspaceId: string;
    goalId?: string;
    taskId: string;
  }): Promise<string[]> {
    const resolved = await this.resolve.execute(context);
    if (resolved.isFailure) {
      return [];
    }
    const rule = resolved.value.find(
      (policy) => policy.rule === REQUIRED_VALIDATIONS_RULE,
    );
    if (!rule) {
      return [];
    }
    // Declarative values come from Json, so the shape is checked rather than
    // trusted: a malformed rule must not silently mandate nothing OR crash a
    // submission. It mandates what it can read.
    return Array.isArray(rule.value)
      ? rule.value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
      : [];
  }
}
