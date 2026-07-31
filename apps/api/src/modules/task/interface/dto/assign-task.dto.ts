import { ActorType } from "@repo/db";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export class AssignTaskDto {
  @IsEnum(ActorType)
  assigneeType!: ActorType;

  @IsString()
  @IsNotEmpty()
  assigneeId!: string;
}
