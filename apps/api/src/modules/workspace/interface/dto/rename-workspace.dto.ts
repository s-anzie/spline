import { IsNotEmpty, IsString } from "class-validator";

export class RenameWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
