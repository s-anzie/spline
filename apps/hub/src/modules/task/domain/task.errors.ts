import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class TaskNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Task", id);
  }
}

export class EmptyAcceptanceCriteriaError extends DomainError {
  constructor() {
    super("A task must declare at least one acceptance criterion (§4.6)");
  }
}

export class IncompatibleAssigneeError extends DomainError {
  constructor(actorType: string) {
    super(`A task is carried out by a human or an agent, never a ${actorType}`);
  }
}

export class TaskNotEditableError extends DomainError {
  constructor(status: string) {
    super(`A ${status} task can no longer be edited`);
  }
}

export class CompletionRequiresValidationError extends DomainError {
  constructor() {
    super(
      "COMPLETED is not reachable through a status change — a task is never completed without validation (§4.24)",
    );
  }
}

export class TaskDependencyError extends DomainError {
  constructor(reason: string) {
    super(`Invalid task dependency: ${reason}`);
  }
}

export class UnsatisfiedTaskDependenciesError extends DomainError {
  constructor(pending: readonly string[]) {
    super(
      `This task cannot become ready until its dependencies are completed (${pending.length} pending)`,
    );
  }
}

export class BlockerNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Blocker", id);
  }
}

export class BlockerAlreadyResolvedError extends DomainError {
  constructor() {
    super("This blocker has already been resolved");
  }
}

/**
 * §11.7 — "toutes les validations obligatoires réussissent". Distinct from
 * CompletionRequiresValidationError, which refuses the *path* (COMPLETED is
 * not reachable by a plain status change); this one refuses the *substance*:
 * the path was right, the proof is not there.
 *
 * Names what is missing rather than only that something is (§17.8): a caller
 * told "no" without being told which validations are outstanding cannot act.
 */
export class MissingProofError extends DomainError {
  constructor(readonly missing: readonly { id: string; type: string }[]) {
    super(
      `This task still needs proof before it can be completed (§11.7): ${missing
        .map((validation) => `${validation.type} (${validation.id})`)
        .join(", ")}`,
    );
  }
}
