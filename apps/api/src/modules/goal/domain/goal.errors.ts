import { GoalStatus } from "@repo/db";

import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyGoalTitleError extends DomainError {
  constructor() {
    super("EMPTY_GOAL_TITLE", "Goal title cannot be empty");
  }
}

export class InvalidGoalStatusTransitionError extends DomainError {
  constructor(from: GoalStatus, to: GoalStatus) {
    super("INVALID_GOAL_STATUS_TRANSITION", `Cannot move a goal from "${from}" to "${to}"`);
  }
}

export class GoalValidationNotPendingError extends DomainError {
  constructor(goalId: string) {
    super(
      "GOAL_VALIDATION_NOT_PENDING",
      `Goal "${goalId}" has no pending validation to accept or reject`,
    );
  }
}

export class EmptyBlockerReasonError extends DomainError {
  constructor() {
    super("EMPTY_BLOCKER_REASON", "A blocker must have a non-empty reason");
  }
}

export class SelfGoalDependencyError extends DomainError {
  constructor(goalId: string) {
    super("SELF_GOAL_DEPENDENCY", `Goal "${goalId}" cannot depend on itself`);
  }
}
