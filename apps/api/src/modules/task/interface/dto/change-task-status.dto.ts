import { TaskStatus } from "@repo/db";
import { IsEnum } from "class-validator";

export class ChangeTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
