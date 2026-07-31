import { IsNotEmpty, IsString } from "class-validator";

export class ReportTaskBlockerDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
