import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

import { RECEIPT_STATUSES, ReceiptStatus } from "../../domain/event-receipt";
import { EVENT_SEVERITIES, EventSeverity } from "../../domain/event-severity";

export class RecordEventDto {
  /** "<category>.<fact>", e.g. "worker.heartbeat_missed". */
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  targetType!: string;

  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @IsOptional()
  @IsIn(EVENT_SEVERITIES)
  severity?: EventSeverity;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class ListEventsQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(EVENT_SEVERITIES)
  severity?: EventSeverity;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  /** Replay reads forward from a known position (§14.5). */
  @IsOptional()
  @IsString()
  afterSequence?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number;
}

export class AdvanceReceiptDto {
  @IsIn(RECEIPT_STATUSES)
  status!: ReceiptStatus;
}

export class RequireReceiptsDto {
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  actorIds!: string[];

  @IsString()
  @IsNotEmpty()
  actorType!: string;
}
