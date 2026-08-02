import { TaskStatus } from "@repo/db";

import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyTaskTitleError extends DomainError {
  constructor() {
    super("EMPTY_TASK_TITLE", "Task title cannot be empty");
  }
}

export class InvalidTaskStatusTransitionError extends DomainError {
  constructor(from: TaskStatus, to: TaskStatus) {
    super("INVALID_TASK_STATUS_TRANSITION", `Cannot move a task from "${from}" to "${to}"`);
  }
}

export class TaskValidationNotPendingError extends DomainError {
  constructor(taskId: string) {
    super(
      "TASK_VALIDATION_NOT_PENDING",
      `Task "${taskId}" has no pending validation to accept or reject`,
    );
  }
}

export class SelfTaskDependencyError extends DomainError {
  constructor(taskId: string) {
    super("SELF_TASK_DEPENDENCY", `Task "${taskId}" cannot depend on itself`);
  }
}

export class EmptyBlockerReasonError extends DomainError {
  constructor() {
    super("EMPTY_BLOCKER_REASON", "A blocker must have a non-empty reason");
  }
}

export class EmptyTaskGoalIdError extends DomainError {
  constructor() {
    super("EMPTY_TASK_GOAL_ID", "A task cannot be linked to an empty goal id");
  }
}
