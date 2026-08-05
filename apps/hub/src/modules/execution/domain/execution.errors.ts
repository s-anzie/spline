import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class RunNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Run", id);
  }
}

/**
 * §4.8's resume invariant, recorded from a real failure (0.3.11).
 *
 * A Claude session cannot resume a Codex thread: session identifiers, thread
 * ids and context formats are not interchangeable between providers. The
 * refusal is explicit and names both sides, because the alternative — accept
 * it and fail somewhere downstream — produces an error message about a
 * malformed context, several layers from the decision that caused it.
 */
export class AttemptNotResumableError extends DomainError {
  constructor(producedBy: string, askedFor: string) {
    super(
      `This attempt ran on "${producedBy}" and cannot be resumed by "${askedFor}": ` +
        "session state and context formats are not interchangeable between providers (§4.8)",
    );
  }
}

/** An attempt is opened, then closed. Anything else is a lost measurement. */
export class NoAttemptInFlightError extends DomainError {
  constructor(runId: string) {
    super(`Run "${runId}" has no attempt in flight to close`);
  }
}

export class AttemptAlreadyInFlightError extends DomainError {
  constructor(runId: string) {
    super(
      `Run "${runId}" is already running an attempt — a retry creates a new run (§9.12)`,
    );
  }
}
