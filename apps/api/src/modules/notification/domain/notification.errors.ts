import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyNotificationBodyError extends DomainError {
  constructor() {
    super("EMPTY_NOTIFICATION_BODY", "A notification must have a non-empty body");
  }
}
