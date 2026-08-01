import { NotificationDeliveryStatus } from "@repo/db";
import { IsEnum } from "class-validator";

export class AdvanceNotificationRecipientDto {
  @IsEnum(NotificationDeliveryStatus)
  status!: NotificationDeliveryStatus;
}
