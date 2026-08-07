import { Inject, Injectable } from "@nestjs/common";

import { ActorRef, ActorType } from "../domain/actor";
import { Permission, roleHasPermission } from "../domain/permission-matrix";
import {
  DELEGATED_POWERS,
  DelegatedPowers,
} from "../domain/ports/delegated-powers.port";
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
    @Inject(DELEGATED_POWERS) private readonly lent: DelegatedPowers,
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
    if (roleHasPermission(membership.role, permission)) {
      return true;
    }

    /**
     * §18.3 — and what this workspace's owner has deliberately lent.
     *
     * Asked only after the matrix has said no, so the ordinary path is
     * unchanged and costs nothing. An owner signing an exception is a
     * recorded act on the workspace, not a hole in the model.
     */
    const extra = await this.lent.lentTo(membership.role, workspaceId);
    return extra.includes(permission);
  }
}
