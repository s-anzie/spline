import { DomainError } from "../../../kernel/domain/domain-error";

export class TaskNotFoundError extends DomainError {
  constructor(taskId: string) {
    super("TASK_NOT_FOUND", `Task "${taskId}" was not found`);
  }
}

export class GoalNotInWorkspaceError extends DomainError {
  constructor(goalId: string, workspaceId: string) {
    super(
      "GOAL_NOT_IN_WORKSPACE",
      `Goal "${goalId}" does not belong to workspace "${workspaceId}"`,
    );
  }
}

export class DependencyTaskNotFoundError extends DomainError {
  constructor(dependencyTaskIds: string[]) {
    super(
      "DEPENDENCY_TASK_NOT_FOUND",
      `Dependency task(s) not found in this workspace: ${dependencyTaskIds.join(", ")}`,
    );
  }
}

export class CircularTaskDependencyError extends DomainError {
  constructor(taskId: string) {
    super(
      "CIRCULAR_TASK_DEPENDENCY",
      `Setting these dependencies on task "${taskId}" would create a dependency cycle`,
    );
  }
}

export class OrphanTaskNotAllowedError extends DomainError {
  constructor(workspaceId: string) {
    super(
      "ORPHAN_TASK_NOT_ALLOWED",
      `Workspace "${workspaceId}" has an active goal — new tasks must be linked to a goal`,
    );
  }
}

export class UnmetTaskDependenciesError extends DomainError {
  constructor(taskId: string, unmetDependencyTaskIds: string[]) {
    super(
      "UNMET_TASK_DEPENDENCIES",
      `Task "${taskId}" cannot start: dependencies not done yet: ${unmetDependencyTaskIds.join(", ")}`,
    );
  }
}
