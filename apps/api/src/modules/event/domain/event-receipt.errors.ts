import { DomainError } from "../../../kernel/domain/domain-error";

export class InvalidEventReceiptStatusError extends DomainError {
  constructor(status: string) {
    super("INVALID_EVENT_RECEIPT_STATUS", `"${status}" is not a valid event receipt status`);
  }
}
