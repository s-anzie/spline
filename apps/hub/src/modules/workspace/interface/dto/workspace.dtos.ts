import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

import { WORKSPACE_STATUSES, WorkspaceStatus } from "../../domain/workspace";

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class ChangeWorkspaceStatusDto {
  @IsIn(WORKSPACE_STATUSES)
  status!: WorkspaceStatus;
}
