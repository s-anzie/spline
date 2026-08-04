import { Policy, PolicyScopeType } from "./policy";

export interface PolicyContext {
  organizationId?: string;
  workspaceId: string;
  repositoryId?: string;
  goalId?: string;
  taskId?: string;
}

export interface EffectivePolicy {
  rule: string;
  value: unknown;
  /** §17.8 — a resolved state is never reported without what produced it. */
  decidedBy: {
    policyId: string;
    scopeType: PolicyScopeType;
    scopeId: string;
    type: string;
  };
}

/**
 * Most specific first. §12.2: "une politique plus spécifique surcharge une
 * politique plus générale" — a written, replayable precedence table rather
 * than a weighted heuristic nobody can predict the output of (§10.18d).
 */
const PRECEDENCE: readonly PolicyScopeType[] = [
  "TASK",
  "GOAL",
  "REPOSITORY",
  "WORKSPACE",
  "ORGANIZATION",
];

function scopeIdFor(
  scopeType: PolicyScopeType,
  context: PolicyContext,
): string | undefined {
  switch (scopeType) {
    case "TASK":
      return context.taskId;
    case "GOAL":
      return context.goalId;
    case "REPOSITORY":
      return context.repositoryId;
    case "WORKSPACE":
      return context.workspaceId;
    case "ORGANIZATION":
      return context.organizationId;
  }
}

/**
 * Resolves **rule by rule**, never block by block: a task overriding one rule
 * must not silently erase everything the workspace set.
 *
 * A level whose identifier is absent from the context is simply skipped — for
 * REPOSITORY that is the normal case of any work outside software (§12.2),
 * never an error.
 */
export function resolveEffectivePolicies(
  policies: readonly Policy[],
  context: PolicyContext,
): Map<string, EffectivePolicy> {
  const effective = new Map<string, EffectivePolicy>();

  for (const scopeType of PRECEDENCE) {
    const scopeId = scopeIdFor(scopeType, context);
    if (scopeId === undefined) {
      continue;
    }
    const atThisLevel = policies
      .filter(
        (policy) =>
          policy.enabled &&
          policy.scopeType === scopeType &&
          policy.scopeId === scopeId,
      )
      // Two rules colliding at the same scope must not depend on load order.
      .sort((a, b) => a.id.value.localeCompare(b.id.value));

    for (const policy of atThisLevel) {
      if (effective.has(policy.rule)) {
        continue;
      }
      effective.set(policy.rule, {
        rule: policy.rule,
        value: policy.value,
        decidedBy: {
          policyId: policy.id.value,
          scopeType: policy.scopeType,
          scopeId: policy.scopeId,
          type: policy.type,
        },
      });
    }
  }

  return effective;
}
