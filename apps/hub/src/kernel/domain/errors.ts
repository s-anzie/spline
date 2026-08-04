import { DomainError } from "./domain-error";
import { TransitionOutcome } from "./state-machine";

/**
 * Standard error for a StateMachine "invalidTransition" outcome (§22.6).
 * Modules either use it directly or subclass it when they need a
 * module-specific type; either way the shape stays uniform for the
 * interface layer to map (fromTerminal → 409/410-style responses).
 */
export class InvalidStateTransitionError extends DomainError {
  readonly from: string;
  readonly to: string;
  readonly fromTerminal: boolean;

  constructor(
    entityName: string,
    outcome: Extract<TransitionOutcome<string>, { kind: "invalidTransition" }>,
  ) {
    super(
      `${entityName} cannot transition from "${outcome.from}" to "${outcome.to}"` +
        (outcome.fromTerminal ? " (terminal state)" : ""),
    );
    this.from = outcome.from;
    this.to = outcome.to;
    this.fromTerminal = outcome.fromTerminal;
  }
}

/**
 * Base for every "X was not found" failure. Abstract on purpose: each
 * module declares its own subclass (TaskNotFoundError, …) so failures
 * stay precisely typed while messages stay uniform.
 */
export abstract class EntityNotFoundError extends DomainError {
  constructor(
    readonly entityName: string,
    readonly entityId: string,
  ) {
    super(`${entityName} "${entityId}" was not found`);
  }
}
