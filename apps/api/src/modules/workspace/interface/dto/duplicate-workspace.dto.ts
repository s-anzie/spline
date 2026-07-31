import { IsNotEmpty, IsString } from "class-validator";

export class DuplicateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
