import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class AcquireLockDto {
  /** Free string: §13.1 lists resources, the Runtime will add more. */
  @IsString()
  @IsNotEmpty()
  resourceType!: string;

  @IsString()
  @IsNotEmpty()
  resourceId!: string;

  /** §4.16 keeps `reason`: a lock nobody can explain is one nobody dares break. */
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ttlMs?: number;
}

export class ManageLockDto {
  @IsIn(["RENEW", "RELEASE"])
  action!: "RENEW" | "RELEASE";

  @IsOptional()
  @IsInt()
  @Min(1)
  ttlMs?: number;
}

export class ListLocksQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  resourceType?: string;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}
