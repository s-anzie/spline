import { DomainError } from "../../../kernel/domain/domain-error";

export class LockNotFoundError extends DomainError {
  constructor(lockId: string) {
    super("LOCK_NOT_FOUND", `Lock "${lockId}" was not found`);
  }
}

export class ResourceAlreadyLockedError extends DomainError {
  constructor(resourceType: string, resourceId: string) {
    super(
      "RESOURCE_ALREADY_LOCKED",
      `Resource "${resourceType}:${resourceId}" is already locked`,
    );
  }
}
