import { LockResourceType } from "@repo/db";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AcquireLockDto {
  @IsEnum(LockResourceType)
  resourceType!: LockResourceType;

  @IsString()
  @IsNotEmpty()
  resourceId!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  scope?: string;
}
