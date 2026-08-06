import { Injectable } from "@nestjs/common";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef } from "../domain/actor";
import { ActorCredential } from "../domain/actor-credential";
import { Organization } from "../domain/organization";
import { RefreshSession } from "../domain/refresh-session";
import { WorkspaceRole } from "../domain/permission-matrix";
import {
  ActorCredentialRepository,
  OrganizationRepository,
  RefreshSessionRepository,
  UserRepository,
  WorkspaceMembershipRepository,
} from "../domain/ports/identity.repository.ports";
import { User } from "../domain/user";
import { WorkspaceMembership } from "../domain/workspace-membership";
import {
  ActorCredentialMapper,
  OrganizationMapper,
  RefreshSessionMapper,
  UserMapper,
  WorkspaceMembershipMapper,
} from "./identity.mappers";

/**
 * §5.19: every save() upserts the FULL mapped payload — `update: data`
 * spreads the complete column set, never a hand-picked field list, so a
 * column added later can never be silently dropped on update.
 */

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(user: User): Promise<void> {
    const data = UserMapper.toPersistence(user);
    await this.prisma.user.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? UserMapper.toDomain(row) : null;
  }
}

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(organization: Organization): Promise<void> {
    const data = OrganizationMapper.toPersistence(organization);
    await this.prisma.organization.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<Organization | null> {
    const row = await this.prisma.organization.findUnique({ where: { id } });
    return row ? OrganizationMapper.toDomain(row) : null;
  }

  async listByOwnerId(ownerId: string): Promise<Organization[]> {
    const rows = await this.prisma.organization.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => OrganizationMapper.toDomain(row));
  }
}

@Injectable()
export class PrismaWorkspaceMembershipRepository
  implements WorkspaceMembershipRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async save(membership: WorkspaceMembership): Promise<void> {
    const data = WorkspaceMembershipMapper.toPersistence(membership);
    await this.prisma.workspaceMembership.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<WorkspaceMembership | null> {
    const row = await this.prisma.workspaceMembership.findUnique({ where: { id } });
    return row ? WorkspaceMembershipMapper.toDomain(row) : null;
  }

  async findByActorAndWorkspace(
    actor: ActorRef,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null> {
    const row = await this.prisma.workspaceMembership.findUnique({
      where: {
        actorType_actorId_workspaceId: {
          actorType: actor.type,
          actorId: actor.actorId,
          workspaceId,
        },
      },
    });
    return row ? WorkspaceMembershipMapper.toDomain(row) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceMembership[]> {
    const rows = await this.prisma.workspaceMembership.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => WorkspaceMembershipMapper.toDomain(row));
  }

  async listByActor(actor: ActorRef): Promise<WorkspaceMembership[]> {
    const rows = await this.prisma.workspaceMembership.findMany({
      where: { actorType: actor.type, actorId: actor.actorId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => WorkspaceMembershipMapper.toDomain(row));
  }

  async countByWorkspaceAndRole(
    workspaceId: string,
    role: WorkspaceRole,
  ): Promise<number> {
    return this.prisma.workspaceMembership.count({ where: { workspaceId, role } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workspaceMembership.deleteMany({ where: { id } });
  }
}

@Injectable()
export class PrismaActorCredentialRepository implements ActorCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(credential: ActorCredential): Promise<void> {
    const data = ActorCredentialMapper.toPersistence(credential);
    await this.prisma.actorCredential.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<ActorCredential | null> {
    const row = await this.prisma.actorCredential.findUnique({ where: { id } });
    return row ? ActorCredentialMapper.toDomain(row) : null;
  }

  async listByActor(actor: ActorRef): Promise<ActorCredential[]> {
    const rows = await this.prisma.actorCredential.findMany({
      where: { actorType: actor.type, actorId: actor.actorId },
      orderBy: { createdAt: "asc" },
      take: pageSize(undefined),
    });
    return rows.map((row) => ActorCredentialMapper.toDomain(row));
  }

  async listByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<ActorCredential[]> {
    const rows = await this.prisma.actorCredential.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      take: pageSize(limit),
    });
    return rows.map((row) => ActorCredentialMapper.toDomain(row));
  }
}

/**
 * §18 — the browser's session chain.
 *
 * `revokeFamily` is a single `updateMany` on purpose: the theft response has
 * to be atomic from the caller's point of view, and reading the chain then
 * writing it back link by link would leave a window in which the successor
 * the thief holds is still redeemable.
 */
@Injectable()
export class PrismaRefreshSessionRepository implements RefreshSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(session: RefreshSession): Promise<void> {
    const data = RefreshSessionMapper.toPersistence(session);
    await this.prisma.refreshSession.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<RefreshSession | null> {
    const row = await this.prisma.refreshSession.findUnique({ where: { id } });
    return row ? RefreshSessionMapper.toDomain(row) : null;
  }

  /**
   * Outside the request's transaction, on purpose.
   *
   * Every caller of this either refuses the request afterwards (a replayed
   * cookie ends in a 401) or is a sign-out. In the first case the
   * interceptor rolls the request back, and a revocation rolled back with it
   * would leave the thief's successor alive — the response to the theft is
   * not part of the operation that failed. In the second, a sign-out that
   * survives whatever else goes wrong is the answer anybody would want.
   */
  async revokeFamily(familyId: string, now: Date): Promise<number> {
    const { count } = await this.prisma.outsideTransaction().refreshSession.updateMany({
      // Already-revoked links keep their original stamp: when is evidence.
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.refreshSession.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    return count;
  }
}
