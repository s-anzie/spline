import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class ArtifactNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Artifact", id);
  }
}

export class InvalidArtifactTypeError extends DomainError {
  constructor(type: string) {
    super(
      `"${type}" is not a valid artifact type — expected SCREAMING_SNAKE_CASE so extensions can declare their own`,
    );
  }
}

/** §15.7 — audit trails, validation reports and signed bundles never change. */
export class ImmutableArtifactError extends DomainError {
  constructor() {
    super("This artifact is immutable: its content and metadata cannot change");
  }
}

export class ArtifactNotActiveError extends DomainError {
  constructor(status: string) {
    super(`This operation requires an ACTIVE artifact (current status: ${status})`);
  }
}

/** A link must point at something real, in the same workspace (§15.3). */
export class ArtifactLinkError extends DomainError {
  constructor(reason: string) {
    super(`Invalid artifact link: ${reason}`);
  }
}
