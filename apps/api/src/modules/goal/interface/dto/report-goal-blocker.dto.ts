import { IsNotEmpty, IsString } from "class-validator";

export class ReportGoalBlockerDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
