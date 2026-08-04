import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class DecisionNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Decision", id);
  }
}

export class DecisionSupersessionError extends DomainError {
  constructor(reason: string) {
    super(`Invalid supersession: ${reason}`);
  }
}

export class DecisionAlreadySupersededError extends DomainError {
  constructor(by: string) {
    super(
      `This decision has already been superseded by "${by}" — record a new decision instead of rewriting the chain`,
    );
  }
}
