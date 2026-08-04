import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

import { ACTOR_TYPES, ActorType } from "../../../identity/domain/actor";
import { MEMORY_SCOPES, MemoryScopeType } from "../../domain/memory-entry";

export class RememberDto {
  @IsIn(MEMORY_SCOPES)
  scopeType!: MemoryScopeType;

  @IsString()
  @IsNotEmpty()
  scopeId!: string;

  /** Free string; §16.9 indexes by it. */
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  /** A note OR a reference — the domain refuses both and refuses neither. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceType?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supersedes?: string;
}

export class ReadContextQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  organizationId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  repositoryId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  goalId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  runId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sessionId?: string;
}

export class SearchMemoryQueryDto {
  @IsOptional()
  @IsIn(MEMORY_SCOPES)
  scopeType?: MemoryScopeType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  scopeId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  type?: string;

  @IsOptional()
  @IsIn(ACTOR_TYPES)
  authorType?: ActorType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  authorId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tag?: string;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeSuperseded?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;
}
