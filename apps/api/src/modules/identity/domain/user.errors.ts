import { DomainError } from "../../../kernel/domain/domain-error";

export class InvalidEmailError extends DomainError {
  constructor(email: string) {
    super("INVALID_EMAIL", `"${email}" is not a valid email address`);
  }
}
