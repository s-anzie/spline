import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyDecisionSubjectError extends DomainError {
  constructor() {
    super("EMPTY_DECISION_SUBJECT", "A decision must have a non-empty subject");
  }
}

export class EmptyDecisionOutcomeError extends DomainError {
  constructor() {
    super("EMPTY_DECISION_OUTCOME", "A decision must record a non-empty outcome");
  }
}

export class InvalidDecisionConfidenceError extends DomainError {
  constructor() {
    super("INVALID_DECISION_CONFIDENCE", "A decision's confidence must be between 0 and 1");
  }
}
