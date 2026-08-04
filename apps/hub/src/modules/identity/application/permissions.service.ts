import { Inject, Injectable } from "@nestjs/common";

import { ActorRef, ActorType } from "../domain/actor";
import { Permission, roleHasPermission } from "../domain/permission-matrix";
import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../domain/ports/identity.repository.ports";

export interface ActorIdentity {
  actorType: ActorType;
  actorId: string;
}

/**
 * The single RBAC decision point (§18.3): membership → role → matrix.
 * Everything unresolvable (invalid ref, no membership) is a plain denial —
 * authorization never throws.
 */
@Injectable()
export class PermissionsService {
  constructor(
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
  ) {}

  async can(
    identity: ActorIdentity,
    permission: Permission,
    workspaceId: string,
  ): Promise<boolean> {
    const actor = ActorRef.create(identity.actorType, identity.actorId);
    if (actor.isFailure) {
      return false;
    }
    const membership = await this.memberships.findByActorAndWorkspace(
      actor.value,
      workspaceId,
    );
    if (!membership) {
      return false;
    }
    return roleHasPermission(membership.role, permission);
  }
}
