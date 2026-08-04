import { DomainError } from "../../../kernel/domain/domain-error";

export class AssigneeNotInWorkspaceError extends DomainError {
  constructor() {
    super("The assignee must already be a member of this workspace");
  }
}

/** A member whose role carries no execute_tasks cannot be handed work. */
export class AssigneeCannotExecuteError extends DomainError {
  constructor() {
    super("The assignee's role does not allow carrying out tasks");
  }
}

export class TaskGoalError extends DomainError {
  constructor(reason: string) {
    super(`Invalid goal for this task: ${reason}`);
  }
}
