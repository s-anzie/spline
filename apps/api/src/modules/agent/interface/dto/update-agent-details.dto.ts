import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class UpdateAgentDetailsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

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
}
