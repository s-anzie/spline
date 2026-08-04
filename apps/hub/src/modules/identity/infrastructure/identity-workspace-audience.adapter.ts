import { Inject, Injectable } from "@nestjs/common";

import {
  WORKSPACE_AUDIENCE,
  WorkspaceAudiencePort,
} from "../../notification/domain/ports/workspace-audience.port";
import { ActorRef } from "../domain/actor";
import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../domain/ports/identity.repository.ports";

/**
 * Supplies the notification module's own abstraction (§DIP): notification
 * owns the rule "a broadcast resolves its recipients at creation", identity
 * owns who those recipients are. Nothing in notification/ imports identity's
 * infrastructure.
 */
@Injectable()
export class IdentityWorkspaceAudience implements WorkspaceAudiencePort {
  constructor(
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
  ) {}

  async membersOf(workspaceId: string): Promise<ActorRef[]> {
    // listByWorkspace already excludes revoked memberships: a revoked member
    // is not an audience, and addressing them would create a row nobody can
    // ever read or acknowledge.
    const memberships = await this.memberships.listByWorkspace(workspaceId);
    return memberships.map((membership) => membership.actor);
  }
}

export const WORKSPACE_AUDIENCE_PROVIDER = {
  provide: WORKSPACE_AUDIENCE,
  useClass: IdentityWorkspaceAudience,
};
