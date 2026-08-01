import { ActorType, NotificationKind, NotificationScope } from "@repo/db";
import { IsArray, IsEnum, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class RecipientDto {
  @IsIn(["HUMAN", "AGENT"])
  type!: ActorType;

  @IsString()
  @IsNotEmpty()
  id!: string;
}

export class SendNotificationDto {
  @IsEnum(NotificationKind)
  kind!: NotificationKind;

  @IsEnum(NotificationScope)
  scope!: NotificationScope;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  linkedEventId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients?: RecipientDto[];
}
