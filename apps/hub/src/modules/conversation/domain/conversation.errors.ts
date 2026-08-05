import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class ThreadNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Thread", id);
  }
}

/**
 * §10.18c's hook, expressed where it can be enforced. A thread has exactly
 * two sides; being a member of the workspace is not the same as being in this
 * conversation.
 */
export class NotAParticipantError extends DomainError {
  constructor(actorId: string) {
    super(`"${actorId}" is not one of this thread's two participants (§10.18)`);
  }
}

export class ThreadClosedError extends DomainError {
  constructor(reason: string) {
    super(`This thread takes no more turns: ${reason}`);
  }
}

/**
 * §10.18b — the bound OpenClaw caps at five turns. Reaching it is not an
 * error in the conversation, it is the conversation ending: the refusal is
 * what tells a caller the difference between "say more" and "stop".
 */
export class TurnBudgetExhaustedError extends DomainError {
  constructor(budget: number) {
    super(
      `This thread used its ${budget} turns. A conversation that needs more is ` +
        "looping, not converging (§10.18b) — open a new one with a fresh subject",
    );
  }
}
