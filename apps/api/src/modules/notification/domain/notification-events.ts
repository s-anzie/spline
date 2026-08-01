import { DomainEvent } from "../../../kernel/domain/domain-event";

export class NotificationSent extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly notificationId: string,
    public readonly kind: string,
    public readonly scope: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "notification.sent";
  }
}
