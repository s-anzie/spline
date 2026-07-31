import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyWorkspaceNameError extends DomainError {
  constructor() {
    super("EMPTY_WORKSPACE_NAME", "Workspace name cannot be empty");
  }
}

export class WorkspaceArchivedError extends DomainError {
  constructor(workspaceId: string) {
    super("WORKSPACE_ARCHIVED", `Workspace "${workspaceId}" is archived and cannot be modified`);
  }
}

export class EmptyWorkspaceRootPathError extends DomainError {
  constructor() {
    super("EMPTY_WORKSPACE_ROOT_PATH", "Workspace root path cannot be empty");
  }
}
