import { DomainError } from "../../../kernel/domain/domain-error";

export class EventNotFoundError extends DomainError {
  constructor(eventId: string) {
    super("EVENT_NOT_FOUND", `Event "${eventId}" was not found`);
  }
}
