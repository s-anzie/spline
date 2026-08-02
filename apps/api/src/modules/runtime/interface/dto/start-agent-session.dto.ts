import { IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class StartAgentSessionDto {
  @IsUUID()
  agentId!: string;

  @IsString()
  @IsNotEmpty()
  machineId!: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  resumeFromSessionId?: string;

  @IsString()
  @IsNotEmpty()
  instruction!: string;
}
