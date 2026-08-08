import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

import { PRIORITIES, Priority } from "../../../../kernel/domain/priority";
import { GOAL_STATUSES, GoalStatus } from "../../domain/goal";

export class CreateGoalDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  successCriteria!: string[];

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parentGoalId?: string;

  /** Execution provenance supplied by the manager bridge, not model input. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceTaskId?: string;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  successCriteria?: string[];

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;
}

export class ChangeGoalStatusDto {
  @IsIn(GOAL_STATUSES)
  status!: GoalStatus;
}

export class UpdateGoalProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;
}

export class ManageGoalDependencyDto {
  @IsString()
  @IsNotEmpty()
  dependsOnGoalId!: string;
}
