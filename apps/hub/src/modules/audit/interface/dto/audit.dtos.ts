import { Type } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";

import { ACTOR_TYPES, ActorType } from "../../../identity/domain/actor";

export class ListAuditQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  action?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  targetType?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  targetId?: string;

  @IsOptional()
  @IsIn(ACTOR_TYPES)
  actorType?: ActorType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  actorId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number;
}
