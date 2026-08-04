import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef } from "../domain/actor";
import { ActorCredential } from "../domain/actor-credential";
import { Organization } from "../domain/organization";
import { WorkspaceRole } from "../domain/permission-matrix";
import {
  ActorCredentialRepository,
  OrganizationRepository,
  UserRepository,
  WorkspaceMembershipRepository,
} from "../domain/ports/identity.repository.ports";
import { User } from "../domain/user";
import { WorkspaceMembership } from "../domain/workspace-membership";
import {
  ActorCredentialMapper,
  OrganizationMapper,
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
    });
    return rows.map((row) => ActorCredentialMapper.toDomain(row));
  }
}
