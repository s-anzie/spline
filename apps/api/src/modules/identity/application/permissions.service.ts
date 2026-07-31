import { ActorType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { Permission } from "../domain/permission";
import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../domain/ports/workspace-membership.repository.port";
import { roleHasPermission } from "../domain/role-permissions";

@Injectable()
export class PermissionsService {
  constructor(
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
  ) {}

  async can(
    actorType: ActorType,
    actorId: string,
    workspaceId: string,
    permission: Permission,
  ): Promise<boolean> {
    const membership = await this.memberships.findByActor(workspaceId, actorType, actorId);
    if (!membership) {
      return false;
    }
    return roleHasPermission(membership.role, permission);
  }

  async listAccessibleWorkspaceIds(actorType: ActorType, actorId: string): Promise<string[]> {
    const memberships = await this.memberships.listByActor(actorType, actorId);
    return memberships.map((membership) => membership.workspaceId);
  }
}
