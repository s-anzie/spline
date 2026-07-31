import { DomainError } from "../../../kernel/domain/domain-error";

export class DecisionNotFoundError extends DomainError {
  constructor(decisionId: string) {
    super("DECISION_NOT_FOUND", `Decision "${decisionId}" was not found`);
  }
}
