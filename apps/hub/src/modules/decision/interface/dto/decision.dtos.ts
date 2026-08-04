import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

import { DECISION_CONFIDENCES, DecisionConfidence } from "../../domain/decision";

export class ConsideredAlternativeDto {
  @IsString()
  @IsNotEmpty()
  option!: string;

  @IsString()
  @IsNotEmpty()
  rejectedBecause!: string;
}

export class RecordDecisionDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  rationale!: string;

  @IsString()
  @IsNotEmpty()
  outcome!: string;

  @IsOptional()
  @IsIn(DECISION_CONFIDENCES)
  confidence?: DecisionConfidence;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsideredAlternativeDto)
  alternatives?: ConsideredAlternativeDto[];
}

export class ListDecisionsQueryDto {
  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsIn(DECISION_CONFIDENCES)
  confidence?: DecisionConfidence;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeSuperseded?: boolean;
}
