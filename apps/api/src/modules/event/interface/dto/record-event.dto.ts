import { EventSeverity } from "@repo/db";
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class EventTargetDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  id!: string;
}

export class RecordEventDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsEnum(EventSeverity)
  severity?: EventSeverity;

  @IsOptional()
  @IsObject()
  target?: EventTargetDto;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
