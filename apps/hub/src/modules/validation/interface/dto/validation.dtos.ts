import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

import { VALIDATION_STATUSES, ValidationStatus } from "../../domain/validation";

export class RequestedValidationDto {
  /** Free string: §11.2 calls the list open, extensible by the registry. */
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependsOnValidationIds?: string[];
}

export class RequestValidationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RequestedValidationDto)
  validations!: RequestedValidationDto[];
}

export const SETTLE_ACTIONS = [
  "START",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
] as const;

export class SettleValidationDto {
  @IsIn(SETTLE_ACTIONS)
  action!: (typeof SETTLE_ACTIONS)[number];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  output?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reportArtifactIds?: string[];
}

export class InvalidateValidationsDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ListValidationsQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @IsOptional()
  @IsIn(VALIDATION_STATUSES)
  status?: ValidationStatus;
}
