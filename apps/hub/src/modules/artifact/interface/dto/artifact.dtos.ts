import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

import { ARTIFACT_STATUSES, ArtifactStatus } from "../../domain/artifact";

export class CreateArtifactDto {
  /** Free-form but validated: an Engine may declare its own types (§19.2). */
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  checksum!: string;

  @IsString()
  @IsNotEmpty()
  storageRef!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  note?: string;

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
  repositoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  immutable?: boolean;
}

export class AddArtifactVersionDto {
  @IsString()
  @IsNotEmpty()
  checksum!: string;

  @IsString()
  @IsNotEmpty()
  storageRef!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateArtifactDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class LinkArtifactDto {
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
  repositoryId?: string;
}

export class UnlinkArtifactDto {
  @IsOptional()
  @IsBoolean()
  goal?: boolean;

  @IsOptional()
  @IsBoolean()
  task?: boolean;

  @IsOptional()
  @IsBoolean()
  repository?: boolean;
}

export class ChangeArtifactStatusDto {
  @IsIn(ARTIFACT_STATUSES)
  status!: ArtifactStatus;
}
