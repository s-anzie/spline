import { IsNotEmpty, IsString } from "class-validator";

export class LinkTaskToGoalDto {
  @IsString()
  @IsNotEmpty()
  goalId!: string;
}
