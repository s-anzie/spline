import { EventReceiptStatus } from "@repo/db";
import { IsEnum } from "class-validator";

export class RecordEventReceiptDto {
  @IsEnum(EventReceiptStatus)
  status!: EventReceiptStatus;
}
