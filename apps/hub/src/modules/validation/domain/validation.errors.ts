import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class ValidationNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Validation", id);
  }
}

/**
 * §10.9 — an agent pronouncing on work assigned to itself.
 *
 * Refused whatever its role and whatever a workspace has lent it (§18.3). A
 * manager may judge its team's work; the same power must not reach its own
 * tasks, and that is a rule about WHOSE WORK it is, which no permission
 * matrix can express.
 */
export class CannotJudgeOwnWorkError extends DomainError {
  constructor(taskId: string) {
    super(
      `This task is assigned to you. An agent never pronounces on its own ` +
        `work — ask somebody else, or report what is blocking you (task ${taskId}, §10.9)`,
    );
  }
}
