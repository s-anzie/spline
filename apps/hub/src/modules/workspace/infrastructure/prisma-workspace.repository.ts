import { Injectable } from "@nestjs/common";
import { Prisma, Workspace as WorkspaceRow } from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { WorkspaceRepository } from "../domain/ports/workspace.repository.port";
import {
  Workspace,
  WorkspaceSettings,
  WorkspaceStatus,
} from "../domain/workspace";

export const WorkspaceMapper = {
  toDomain(row: WorkspaceRow): Workspace {
    return Workspace.reconstitute(
      {
        organizationId: row.organizationId,
        name: row.name,
        slug: row.slug,
        description: row.description,
        status: row.status as WorkspaceStatus,
        settings: (row.settings ?? {}) as WorkspaceSettings,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.id,
    );
  },

  toPersistence(
    workspace: Workspace,
  ): Omit<WorkspaceRow, "settings"> & { settings: Prisma.JsonObject } {
    return {
      id: workspace.id.value,
      organizationId: workspace.organizationId,
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description,
      status: workspace.status,
      settings: workspace.settings as Prisma.JsonObject,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  },
};

/** §5.19: upserts the FULL mapped payload, never a hand-picked field list. */
@Injectable()
export class PrismaWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(workspace: Workspace): Promise<void> {
    const data = WorkspaceMapper.toPersistence(workspace);
    await this.prisma.workspace.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<Workspace | null> {
    const row = await this.prisma.workspace.findUnique({ where: { id } });
    return row ? WorkspaceMapper.toDomain(row) : null;
  }

  async listByIds(ids: readonly string[]): Promise<Workspace[]> {
    const rows = await this.prisma.workspace.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { createdAt: "asc" },
    
      // An absent limit is a page, never the whole table (kernel pagination).
      take: pageSize(undefined),
    });
    return rows.map((row) => WorkspaceMapper.toDomain(row));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workspace.deleteMany({ where: { id } });
  }
}
