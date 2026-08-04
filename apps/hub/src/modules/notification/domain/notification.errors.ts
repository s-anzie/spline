import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class NotificationNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Notification", id);
  }
}

/**
 * Reported when the caller is not among the resolved recipients — including
 * when the notification itself exists. §4.19 makes taking notice individual:
 * you can only advance your own row, never someone else's.
 */
export class NotificationRecipientNotFoundError extends EntityNotFoundError {
  constructor(notificationId: string) {
    super("NotificationRecipient", notificationId);
  }
}

/**
 * A message with no addressee is not a message. This is a real case, not a
 * defensive one: a broadcast to a workspace whose members have all been
 * revoked resolves to an empty audience, and silently storing it would leave
 * something nobody can ever read or acknowledge.
 */
export class NoRecipientsError extends DomainError {
  constructor() {
    super("This notification resolves to no recipient — nobody would ever read it");
  }
}
