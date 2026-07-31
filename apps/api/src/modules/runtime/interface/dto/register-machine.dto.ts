import { IsNotEmpty, IsString } from "class-validator";

export class RegisterMachineDto {
  @IsString()
  @IsNotEmpty()
  hostname!: string;

  @IsString()
  @IsNotEmpty()
  os!: string;
}
