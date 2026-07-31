import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateArtifactMetadataDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  source?: string;
}
