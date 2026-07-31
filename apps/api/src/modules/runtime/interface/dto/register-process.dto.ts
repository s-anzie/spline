import { RestartPolicy } from "@repo/db";
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from "class-validator";

export class RegisterProcessDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  command!: string;

  @IsString()
  @IsNotEmpty()
  cwd!: string;

  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @IsOptional()
  @IsUUID()
  ownerAgentId?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  ports?: number[];

  @IsOptional()
  @IsEnum(RestartPolicy)
  restartPolicy?: RestartPolicy;
}
