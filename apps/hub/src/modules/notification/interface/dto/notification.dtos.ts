import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

import { ACTOR_TYPES, ActorType } from "../../../identity/domain/actor";
import { DELIVERY_STATUSES, DeliveryStatus } from "../../domain/notification-recipient";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_SCOPES,
  NotificationKind,
  NotificationScope,
} from "../../domain/notification";

export class RecipientDto {
  @IsIn(ACTOR_TYPES)
  actorType!: ActorType;

  @IsString()
  @IsNotEmpty()
  actorId!: string;
}

export class SendNotificationDto {
  @IsIn(NOTIFICATION_KINDS)
  kind!: NotificationKind;

  @IsIn(NOTIFICATION_SCOPES)
  scope!: NotificationScope;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  /** Ignored for a BROADCAST: the audience is resolved from the workspace. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients?: RecipientDto[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class AdvanceRecipientDto {
  @IsIn(DELIVERY_STATUSES)
  status!: DeliveryStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  failureReason?: string;
}

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsIn(NOTIFICATION_KINDS)
  kind?: NotificationKind;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;
}
