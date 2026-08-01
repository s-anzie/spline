import { ActorType } from "@repo/db";
import { IsIn, IsNotEmpty, IsString } from "class-validator";

export class ListUnreadNotificationsQueryDto {
  @IsIn(["HUMAN", "AGENT"])
  recipientType!: ActorType;

  @IsString()
  @IsNotEmpty()
  recipientId!: string;
}
