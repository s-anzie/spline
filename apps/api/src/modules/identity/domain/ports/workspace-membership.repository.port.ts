import { ActorType } from "@repo/db";

import { WorkspaceMembership } from "../workspace-membership";

export const WORKSPACE_MEMBERSHIP_REPOSITORY = Symbol("WORKSPACE_MEMBERSHIP_REPOSITORY");

export interface WorkspaceMembershipRepository {
  findByActor(
    workspaceId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<WorkspaceMembership | null>;
  listByWorkspace(workspaceId: string): Promise<WorkspaceMembership[]>;
  listByActor(actorType: ActorType, actorId: string): Promise<WorkspaceMembership[]>;
  save(membership: WorkspaceMembership): Promise<void>;
}
