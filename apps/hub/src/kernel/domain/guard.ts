import { DomainError } from "./domain-error";
import { Result } from "./result";

/** Raised when a factory argument violates a basic structural guard. */
export class GuardViolation extends DomainError {
  constructor(
    readonly argumentName: string,
    requirement: string,
  ) {
    super(`"${argumentName}" ${requirement}`);
  }
}

/**
 * Standard argument guards for entity factories: every `create()` validates
 * through these instead of hand-rolling trim/null/range checks, so failure
 * messages and semantics stay uniform across modules.
 */
export const Guard = {
  /** Fails on null/undefined/empty/whitespace; succeeds with the trimmed value. */
  againstEmpty(
    value: string | null | undefined,
    argumentName: string,
  ): Result<string, GuardViolation> {
    const trimmed = value?.trim();
    if (!trimmed) {
      return Result.fail(new GuardViolation(argumentName, "must not be empty"));
    }
    return Result.ok(trimmed);
  },

  againstNullOrUndefined<T>(
    value: T | null | undefined,
    argumentName: string,
  ): Result<T, GuardViolation> {
    if (value === null || value === undefined) {
      return Result.fail(new GuardViolation(argumentName, "is required"));
    }
    return Result.ok(value);
  },

  /** Accepts zero and positive finite numbers only. */
  againstNegative(value: number, argumentName: string): Result<number, GuardViolation> {
    if (!Number.isFinite(value) || value < 0) {
      return Result.fail(
        new GuardViolation(argumentName, "must be a non-negative finite number"),
      );
    }
    return Result.ok(value);
  },
};
