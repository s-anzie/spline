import { DomainError } from "../../../kernel/domain/domain-error";

export class WorkspaceNotFoundError extends DomainError {
  constructor(workspaceId: string) {
    super("WORKSPACE_NOT_FOUND", `Workspace "${workspaceId}" was not found`);
  }
}
