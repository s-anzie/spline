import { Injectable } from "@nestjs/common";
import { TaskGrant as GrantRow } from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../domain/actor";
import { Permission } from "../domain/permission-matrix";
import { TaskGrantRepository } from "../domain/ports/identity.repository.ports";
import { TaskGrant } from "../domain/task-grant";

@Injectable()
export class PrismaTaskGrantRepository implements TaskGrantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(grant: TaskGrant): Promise<void> {
    const data = {
      workspaceId: grant.workspaceId,
      taskId: grant.taskId,
      actorType: grant.actor.type,
      actorId: grant.actor.actorId,
      scopes: [...grant.scopes] as unknown as object,
      tokenHash: grant.tokenHash,
      createdAt: grant.createdAt,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
    };
    await this.prisma.taskGrant.upsert({
      where: { id: grant.id.value },
      create: { id: grant.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<TaskGrant | null> {
    const row = await this.prisma.taskGrant.findUnique({ where: { id } });
    return row ? toGrant(row) : null;
  }

  async listForTask(workspaceId: string, taskId: string): Promise<TaskGrant[]> {
    const rows = await this.prisma.taskGrant.findMany({
      where: { workspaceId, taskId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      take: pageSize(undefined),
    });
    return rows.map(toGrant);
  }
}

function toGrant(row: GrantRow): TaskGrant {
  return TaskGrant.reconstitute(
    {
      workspaceId: row.workspaceId,
      taskId: row.taskId,
      actor: ActorRef.create(row.actorType as ActorType, row.actorId).value,
      scopes: (row.scopes ?? []) as Permission[],
      tokenHash: row.tokenHash,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    },
    row.id,
  );
}
