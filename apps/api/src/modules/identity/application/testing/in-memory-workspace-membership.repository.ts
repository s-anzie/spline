import { ActorType } from "@repo/db";

import { WorkspaceMembershipRepository } from "../../domain/ports/workspace-membership.repository.port";
import { WorkspaceMembership } from "../../domain/workspace-membership";

export class InMemoryWorkspaceMembershipRepository implements WorkspaceMembershipRepository {
  private readonly memberships = new Map<string, WorkspaceMembership>();

  private key(workspaceId: string, actorType: ActorType, actorId: string): string {
    return `${workspaceId}:${actorType}:${actorId}`;
  }

  async findByActor(
    workspaceId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<WorkspaceMembership | null> {
    return this.memberships.get(this.key(workspaceId, actorType, actorId)) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceMembership[]> {
    return [...this.memberships.values()].filter((m) => m.workspaceId === workspaceId);
  }

  async listByActor(actorType: ActorType, actorId: string): Promise<WorkspaceMembership[]> {
    return [...this.memberships.values()].filter(
      (m) => m.actorType === actorType && m.actorId === actorId,
    );
  }

  async save(membership: WorkspaceMembership): Promise<void> {
    this.memberships.set(
      this.key(membership.workspaceId, membership.actorType, membership.actorId),
      membership,
    );
  }
}
