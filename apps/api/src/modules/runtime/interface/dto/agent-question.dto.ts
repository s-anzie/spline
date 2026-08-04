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

export class AnswerHumanQuestionDto {
  @IsString()
  @IsNotEmpty()
  answer!: string;
}

export class ManagerMessageDto {
  @IsUUID()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsUUID()
  replyToNotificationId?: string;
}

export class EditManagerMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;
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
  @IsUUID()
  goalId!: string;

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

export class ActivateAgentDto {
  @IsUUID()
  agentId!: string;

  @IsString()
  @IsNotEmpty()
  machineId!: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsString()
  @IsNotEmpty()
  instruction!: string;
}
