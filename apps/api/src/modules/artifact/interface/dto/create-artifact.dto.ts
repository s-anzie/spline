import { ArtifactType } from "@repo/db";
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateArtifactDto {
  @IsOptional()
  @IsUUID()
  goalId?: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsString()
  decisionId?: string;

  @IsOptional()
  @IsString()
  processId?: string;

  @IsEnum(ArtifactType)
  type!: ArtifactType;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  contentRef?: string;

  @IsOptional()
  @IsString()
  checksum?: string;
}
