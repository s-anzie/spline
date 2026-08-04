import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class WorkspaceNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Workspace", id);
  }
}

export class InvalidWorkspaceNameError extends DomainError {
  constructor(name: string) {
    super(`"${name}" cannot be turned into a valid workspace slug`);
  }
}

export class EmptyWorkspacePoliciesError extends DomainError {
  constructor() {
    super(
      "A workspace must always keep at least one policy (settings.policies cannot be emptied)",
    );
  }
}

export class WorkspaceNotActiveError extends DomainError {
  constructor(status: string) {
    super(`This operation requires an ACTIVE workspace (current status: ${status})`);
  }
}

export class NotOrganizationOwnerError extends DomainError {
  constructor() {
    super("Only the owner of the organization can create a workspace in it");
  }
}
