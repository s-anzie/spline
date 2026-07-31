import { AgentHealthState } from "@repo/db";
import { IsEnum } from "class-validator";

export class UpdateAgentHealthDto {
  @IsEnum(AgentHealthState)
  healthState!: AgentHealthState;
}
