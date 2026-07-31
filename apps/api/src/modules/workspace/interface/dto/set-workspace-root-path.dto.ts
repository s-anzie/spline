import { IsNotEmpty, IsString } from "class-validator";

export class SetWorkspaceRootPathDto {
  @IsString()
  @IsNotEmpty()
  rootPath!: string;
}
