import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class RenameWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;
}
