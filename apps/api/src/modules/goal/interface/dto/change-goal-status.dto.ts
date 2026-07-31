import { GoalStatus } from "@repo/db";
import { IsEnum } from "class-validator";

export class ChangeGoalStatusDto {
  @IsEnum(GoalStatus)
  status!: GoalStatus;
}
