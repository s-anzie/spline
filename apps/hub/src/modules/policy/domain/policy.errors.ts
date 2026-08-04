import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class PolicyNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Policy", id);
  }
}

/**
 * §12.4-12.5 — Denied. Names the rule and the scope that decided, never only
 * that something was refused (§17.8): a caller told "no" without being told
 * which rule, set where, cannot do anything about it.
 */
export class PolicyViolationError extends DomainError {
  constructor(
    readonly rule: string,
    readonly scopeType: string,
    readonly detail: string,
  ) {
    super(`Denied by policy "${rule}" set at ${scopeType} scope: ${detail}`);
  }
}
