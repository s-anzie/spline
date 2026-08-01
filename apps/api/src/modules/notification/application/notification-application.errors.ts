import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyDirectRecipientsError extends DomainError {
  constructor() {
    super("EMPTY_DIRECT_RECIPIENTS", "A direct-scoped notification must name at least one recipient");
  }
}

export class NotificationNotFoundError extends DomainError {
  constructor(notificationId: string) {
    super("NOTIFICATION_NOT_FOUND", `Notification "${notificationId}" was not found`);
  }
}

export class NotificationRecipientNotFoundError extends DomainError {
  constructor(recipientId: string) {
    super("NOTIFICATION_RECIPIENT_NOT_FOUND", `Notification recipient "${recipientId}" was not found`);
  }
}
