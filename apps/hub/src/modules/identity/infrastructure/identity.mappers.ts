import {
  ActorCredential as ActorCredentialRow,
  Organization as OrganizationRow,
  User as UserRow,
  WorkspaceMembership as MembershipRow,
} from "@repo/db";

import { ActorRef, ActorType } from "../domain/actor";
import { ActorCredential } from "../domain/actor-credential";
import { Email } from "../domain/email";
import { Organization } from "../domain/organization";
import { WorkspaceRole } from "../domain/permission-matrix";
import { User } from "../domain/user";
import { WorkspaceMembership } from "../domain/workspace-membership";

/**
 * Rows → aggregates (reconstitute, never raises events) and aggregates →
 * full row payloads. Every toPersistence returns the COMPLETE column set —
 * repositories spread it into both create and update (§5.19): a field
 * added later to the aggregate cannot be silently dropped on update.
 */

export const UserMapper = {
  toDomain(row: UserRow): User {
    return User.reconstitute(
      {
        email: Email.create(row.email).value,
        passwordHash: row.passwordHash,
        displayName: row.displayName,
        createdAt: row.createdAt,
      },
      row.id,
    );
  },

  toPersistence(user: User): Omit<UserRow, never> {
    return {
      id: user.id.value,
      email: user.email.value,
      passwordHash: user.passwordHash,
      displayName: user.displayName,
      createdAt: user.createdAt,
    };
  },
};

export const OrganizationMapper = {
  toDomain(row: OrganizationRow): Organization {
    return Organization.reconstitute(
      {
        name: row.name,
        slug: row.slug,
        ownerId: row.ownerId,
        createdAt: row.createdAt,
      },
      row.id,
    );
  },

  toPersistence(organization: Organization): Omit<OrganizationRow, never> {
    return {
      id: organization.id.value,
      name: organization.name,
      slug: organization.slug,
      ownerId: organization.ownerId,
      createdAt: organization.createdAt,
    };
  },
};

export const WorkspaceMembershipMapper = {
  toDomain(row: MembershipRow): WorkspaceMembership {
    return WorkspaceMembership.reconstitute(
      {
        actor: ActorRef.create(row.actorType as ActorType, row.actorId).value,
        workspaceId: row.workspaceId,
        role: row.role as WorkspaceRole,
        createdAt: row.createdAt,
      },
      row.id,
    );
  },

  toPersistence(membership: WorkspaceMembership): Omit<MembershipRow, never> {
    return {
      id: membership.id.value,
      actorType: membership.actor.type,
      actorId: membership.actor.actorId,
      workspaceId: membership.workspaceId,
      role: membership.role,
      createdAt: membership.createdAt,
    };
  },
};

export const ActorCredentialMapper = {
  toDomain(row: ActorCredentialRow): ActorCredential {
    return ActorCredential.reconstitute(
      {
        actor: ActorRef.create(row.actorType as ActorType, row.actorId).value,
        organizationId: row.organizationId,
        displayName: row.displayName,
        tokenHash: row.tokenHash,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt,
        lastUsedAt: row.lastUsedAt,
      },
      row.id,
    );
  },

  toPersistence(credential: ActorCredential): Omit<ActorCredentialRow, never> {
    return {
      id: credential.id.value,
      actorType: credential.actor.type,
      actorId: credential.actor.actorId,
      organizationId: credential.organizationId,
      displayName: credential.displayName,
      tokenHash: credential.tokenHash,
      createdAt: credential.createdAt,
      revokedAt: credential.revokedAt,
      lastUsedAt: credential.lastUsedAt,
    };
  },
};
