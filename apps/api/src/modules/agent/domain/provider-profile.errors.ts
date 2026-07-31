import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyProviderNameError extends DomainError {
  constructor() {
    super("EMPTY_PROVIDER_NAME", "Provider name cannot be empty");
  }
}
