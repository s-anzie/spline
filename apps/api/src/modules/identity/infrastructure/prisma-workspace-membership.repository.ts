import { ActorType } from "@repo/db";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../prisma/prisma.service";
import { WorkspaceMembershipRepository } from "../domain/ports/workspace-membership.repository.port";
import { WorkspaceMembership } from "../domain/workspace-membership";
import { WorkspaceMembershipMapper } from "./workspace-membership.mapper";

@Injectable()
export class PrismaWorkspaceMembershipRepository implements WorkspaceMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByActor(
    workspaceId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<WorkspaceMembership | null> {
    const record = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_actorType_actorId: { workspaceId, actorType, actorId } },
    });
    return record ? WorkspaceMembershipMapper.toDomain(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceMembership[]> {
    const records = await this.prisma.workspaceMembership.findMany({ where: { workspaceId } });
    return records.map(WorkspaceMembershipMapper.toDomain);
  }

  async listByActor(actorType: ActorType, actorId: string): Promise<WorkspaceMembership[]> {
    const records = await this.prisma.workspaceMembership.findMany({
      where: { actorType, actorId },
    });
    return records.map(WorkspaceMembershipMapper.toDomain);
  }

  async save(membership: WorkspaceMembership): Promise<void> {
    const data = WorkspaceMembershipMapper.toPersistence(membership);
    await this.prisma.workspaceMembership.upsert({
      where: {
        workspaceId_actorType_actorId: {
          workspaceId: data.workspaceId,
          actorType: data.actorType,
          actorId: data.actorId,
        },
      },
      create: data,
      update: { role: data.role },
    });
  }
}
