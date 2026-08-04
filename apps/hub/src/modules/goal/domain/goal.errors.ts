import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class GoalNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Goal", id);
  }
}

export class EmptySuccessCriteriaError extends DomainError {
  constructor() {
    super("A goal must declare at least one success criterion (§4.5)");
  }
}

export class IncompatibleGoalOwnerError extends DomainError {
  constructor(actorType: string) {
    super(`A goal is owned by a human or an agent, never a ${actorType}`);
  }
}

export class GoalNotEditableError extends DomainError {
  constructor(status: string) {
    super(`A ${status} goal can no longer be edited`);
  }
}

export class CompletionRequiresApprovalError extends DomainError {
  constructor() {
    super(
      "COMPLETED is not reachable through a status change — completion is an approval (use the complete operation)",
    );
  }
}

export class GoalHierarchyError extends DomainError {
  constructor(reason: string) {
    super(`Invalid goal hierarchy: ${reason}`);
  }
}

export class OpenChildrenError extends DomainError {
  constructor() {
    super("A goal cannot be completed while sub-goals are still open");
  }
}

export class GoalDependencyError extends DomainError {
  constructor(reason: string) {
    super(`Invalid goal dependency: ${reason}`);
  }
}

export class UnsatisfiedDependenciesError extends DomainError {
  constructor(pending: readonly string[]) {
    super(
      `This goal cannot become active until its dependencies are completed (${pending.length} pending)`,
    );
  }
}
