import { DomainError } from "../../../kernel/domain/domain-error";

export class EmailAlreadyInUseError extends DomainError {
  constructor(email: string) {
    super("EMAIL_ALREADY_IN_USE", `"${email}" is already registered`);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("INVALID_CREDENTIALS", "Invalid email or password");
  }
}
