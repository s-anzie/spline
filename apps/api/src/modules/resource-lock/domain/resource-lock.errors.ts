import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyLockResourceIdError extends DomainError {
  constructor() {
    super("EMPTY_LOCK_RESOURCE_ID", "A resource lock must target a non-empty resource id");
  }
}

export class InvalidLockExpiryError extends DomainError {
  constructor() {
    super("INVALID_LOCK_EXPIRY", "A resource lock's expiry must be in the future");
  }
}

export class LockAlreadyReleasedError extends DomainError {
  constructor(lockId: string) {
    super("LOCK_ALREADY_RELEASED", `Lock "${lockId}" has already been released`);
  }
}

export class NotLockOwnerError extends DomainError {
  constructor(lockId: string) {
    super("NOT_LOCK_OWNER", `Lock "${lockId}" can only be released by the actor who acquired it`);
  }
}
