import { WorkspaceMembership as PrismaWorkspaceMembership } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { WorkspaceMembership } from "../domain/workspace-membership";

export class WorkspaceMembershipMapper {
  static toDomain(record: PrismaWorkspaceMembership): WorkspaceMembership {
    return WorkspaceMembership.create(
      {
        workspaceId: record.workspaceId,
        actorType: record.actorType,
        actorId: record.actorId,
        role: record.role,
        createdAt: record.createdAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(membership: WorkspaceMembership): PrismaWorkspaceMembership {
    return {
      id: membership.id.toString(),
      workspaceId: membership.workspaceId,
      actorType: membership.actorType,
      actorId: membership.actorId,
      role: membership.role,
      createdAt: membership.createdAt,
    };
  }
}
