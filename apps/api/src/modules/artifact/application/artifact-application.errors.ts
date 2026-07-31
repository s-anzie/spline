import { DomainError } from "../../../kernel/domain/domain-error";

export class ArtifactNotFoundError extends DomainError {
  constructor(artifactId: string) {
    super("ARTIFACT_NOT_FOUND", `Artifact "${artifactId}" was not found`);
  }
}

export class LinkedGoalNotInWorkspaceError extends DomainError {
  constructor(goalId: string, workspaceId: string) {
    super(
      "LINKED_GOAL_NOT_IN_WORKSPACE",
      `Goal "${goalId}" does not belong to workspace "${workspaceId}"`,
    );
  }
}

export class LinkedTaskNotInWorkspaceError extends DomainError {
  constructor(taskId: string, workspaceId: string) {
    super(
      "LINKED_TASK_NOT_IN_WORKSPACE",
      `Task "${taskId}" does not belong to workspace "${workspaceId}"`,
    );
  }
}
