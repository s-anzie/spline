import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";
import { Priority } from "@repo/db";
import { IsEnum } from "class-validator";

export class AskManagerDto {
  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsString()
  @IsNotEmpty()
  context!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  recommendation?: string;

  @IsBoolean()
  blocking!: boolean;

  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

export class AnswerQuestionDto {
  @IsString()
  @IsNotEmpty()
  answer!: string;
}

export class AskHumanDto {
  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsString()
  @IsNotEmpty()
  context!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  recommendation?: string;

  @IsUUID()
  sessionId!: string;
}

export class DelegateTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsUUID()
  agentId!: string;

  @IsString()
  @IsNotEmpty()
  machineId!: string;

  @IsString()
  @IsNotEmpty()
  instruction!: string;
}
