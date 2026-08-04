import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class InvalidEmailError extends DomainError {
  constructor(raw: string) {
    super(`"${raw}" is not a valid email address`);
  }
}

export class MalformedActorTokenError extends DomainError {
  constructor() {
    super("The provided actor token is malformed");
  }
}

export class IncompatibleRoleError extends DomainError {
  constructor(actorType: string, role: string) {
    super(`An actor of type ${actorType} cannot hold the role ${role}`);
  }
}

export class InvalidOrganizationNameError extends DomainError {
  constructor(name: string) {
    super(`"${name}" cannot be turned into a valid organization slug`);
  }
}

export class HumanCredentialNotAllowedError extends DomainError {
  constructor() {
    super("Humans authenticate with email and password, never with opaque tokens");
  }
}

export class WeakPasswordError extends DomainError {
  constructor(minimumLength: number) {
    super(`Password must be at least ${minimumLength} characters long`);
  }
}

export class EmailAlreadyInUseError extends DomainError {
  constructor() {
    super("This email address is already registered");
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    // One single failure for unknown-email and wrong-password alike:
    // distinguishing them would hand out an email-enumeration primitive.
    super("Invalid credentials");
  }
}

export class CredentialRevokedError extends DomainError {
  constructor() {
    super("This credential has been revoked");
  }
}

export class MembershipAlreadyExistsError extends DomainError {
  constructor() {
    super("This actor already has a membership in this workspace");
  }
}

export class CannotRemoveLastOwnerError extends DomainError {
  constructor(workspaceId: string) {
    super(`Workspace "${workspaceId}" must keep at least one OWNER`);
  }
}

export class UserNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("User", id);
  }
}

export class OrganizationNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Organization", id);
  }
}

export class MembershipNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("WorkspaceMembership", id);
  }
}

export class CredentialNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("ActorCredential", id);
  }
}
