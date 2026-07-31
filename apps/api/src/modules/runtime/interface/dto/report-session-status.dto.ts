import { AgentSessionStatus } from "@repo/db";
import { IsEnum } from "class-validator";

export class ReportSessionStatusDto {
  @IsEnum(AgentSessionStatus)
  status!: AgentSessionStatus;
}
