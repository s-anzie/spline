import { IsNotEmpty, IsString } from "class-validator";

export class StartProcessDto {
  @IsString()
  @IsNotEmpty()
  machineId!: string;
}
