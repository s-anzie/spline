import { ActorType, WorkspaceRole } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../domain/ports/workspace-membership.repository.port";
import { WorkspaceMembership } from "../domain/workspace-membership";

export interface AssignWorkspaceRoleInput {
  workspaceId: string;
  actorType: ActorType;
  actorId: string;
  role: WorkspaceRole;
}

@Injectable()
export class AssignWorkspaceRoleUseCase {
  constructor(
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
  ) {}

  async execute(input: AssignWorkspaceRoleInput): Promise<WorkspaceMembership> {
    const existing = await this.memberships.findByActor(
      input.workspaceId,
      input.actorType,
      input.actorId,
    );

    if (existing) {
      existing.changeRole(input.role);
      await this.memberships.save(existing);
      return existing;
    }

    const membership = WorkspaceMembership.create(input);
    await this.memberships.save(membership);
    return membership;
  }
}
