import { Result } from "../../../kernel/domain/result";
import { ValueObject } from "../../../kernel/domain/value-object";
import { InvalidEmailError } from "./identity.errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailProps extends Record<string, unknown> {
  value: string;
}

/** Normalized (trimmed, lowercased) validated email address. */
export class Email extends ValueObject<EmailProps> {
  static create(raw: string): Result<Email, InvalidEmailError> {
    const normalized = raw.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      return Result.fail(new InvalidEmailError(raw));
    }
    return Result.ok(new Email({ value: normalized }));
  }

  get value(): string {
    return this.props.value;
  }
}
