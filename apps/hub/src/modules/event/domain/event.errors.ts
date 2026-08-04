import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class EventNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Event", id);
  }
}

export class MalformedEventTypeError extends DomainError {
  constructor(type: string) {
    super(
      `"${type}" carries no category — an event type is "<category>.<fact>", e.g. "task.completed"`,
    );
  }
}

export class EventReceiptNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("EventReceipt", id);
  }
}
