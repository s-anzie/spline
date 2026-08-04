import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

import { ACTOR_TYPES, ActorType } from "../../domain/actor";
import { WORKSPACE_ROLES, WorkspaceRole } from "../../domain/permission-matrix";

export class InviteMemberDto {
  @IsIn(WORKSPACE_ROLES)
  role!: WorkspaceRole;

  /** Humans are invited by email; other actors by explicit reference. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  email?: string;

  @IsOptional()
  @IsIn(ACTOR_TYPES)
  actorType?: ActorType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  actorId?: string;
}

export class ChangeMemberRoleDto {
  @IsIn(WORKSPACE_ROLES)
  role!: WorkspaceRole;
}
