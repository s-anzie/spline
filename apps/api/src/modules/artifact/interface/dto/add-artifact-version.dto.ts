import { IsOptional, IsString } from "class-validator";

export class AddArtifactVersionDto {
  @IsOptional()
  @IsString()
  contentRef?: string;

  @IsOptional()
  @IsString()
  checksum?: string;
}
