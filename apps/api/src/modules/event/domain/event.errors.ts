import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyEventTypeError extends DomainError {
  constructor() {
    super("EMPTY_EVENT_TYPE", "An event must have a non-empty type");
  }
}
