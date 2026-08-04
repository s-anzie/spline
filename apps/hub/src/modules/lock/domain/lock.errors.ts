import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class LockNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("ResourceLock", id);
  }
}

/** Renewing or releasing something that is no longer held. */
export class LockNotHeldError extends DomainError {
  constructor(resource: string) {
    super(`The lock on "${resource}" is no longer held — its lease has run out`);
  }
}

/**
 * §13.4 — a real conflict, the second of the two paths (§13.7). Names the
 * holder and the deadline rather than only refusing (§17.8): a caller told
 * "no" without being told by whom and until when can only retry blindly.
 */
export class LockConflictError extends DomainError {
  constructor(
    readonly resource: string,
    readonly heldBy: { type: string; id: string },
    readonly expiresAt: Date,
  ) {
    super(
      `"${resource}" is held by ${heldBy.type} ${heldBy.id} until ${expiresAt.toISOString()}`,
    );
  }
}

/** Only the holder manages a lock — or an operator, deliberately (§1.6). */
export class LockNotOwnedError extends DomainError {
  constructor(resource: string) {
    super(`Only the holder of "${resource}" can renew or release it`);
  }
}
