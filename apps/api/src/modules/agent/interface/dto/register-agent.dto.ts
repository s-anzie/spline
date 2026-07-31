import { WorkspaceRole } from "@repo/db";
import { IsArray, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class RegisterAgentDto {
  @IsString()
  @IsNotEmpty()
  provider!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsObject()
  promptProfile?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;
}
