import { Injectable } from "@nestjs/common";
import { MemoryEntry as MemoryRow } from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { PER_SCOPE_LIMIT } from "../domain/context-builder";
import { MemoryEntry, MemoryScopeType } from "../domain/memory-entry";
import {
  DEFAULT_MEMORY_PAGE,
  MAX_MEMORY_PAGE,
  MemoryRepository,
  SearchMemoryFilter,
} from "../domain/ports/memory.repository.port";

export const MemoryMapper = {
  toDomain(row: MemoryRow): MemoryEntry {
    return MemoryEntry.reconstitute(
      {
        workspaceId: row.workspaceId,
        scopeType: row.scopeType as MemoryScopeType,
        scopeId: row.scopeId,
        type: row.type,
        title: row.title,
        content: row.content,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        tags: (row.tags ?? []) as string[],
        author: ActorRef.create(row.authorType as ActorType, row.authorId).value,
        supersededById: row.supersededById,
        forgottenAt: row.forgottenAt,
        createdAt: row.createdAt,
      },
      row.id,
    );
  },
};

@Injectable()
export class PrismaMemoryRepository implements MemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole aggregate, never a hand-picked subset. */
  async save(entry: MemoryEntry): Promise<void> {
    const data = {
      workspaceId: entry.workspaceId,
      scopeType: entry.scopeType,
      scopeId: entry.scopeId,
      type: entry.type,
      title: entry.title,
      content: entry.content,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      tags: [...entry.tags],
      authorType: entry.author.type,
      authorId: entry.author.actorId,
      supersededById: entry.supersededById,
      forgottenAt: entry.forgottenAt,
      createdAt: entry.createdAt,
    };
    await this.prisma.memoryEntry.upsert({
      where: { id: entry.id.value },
      create: { id: entry.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<MemoryEntry | null> {
    const row = await this.prisma.memoryEntry.findUnique({ where: { id } });
    return row ? MemoryMapper.toDomain(row) : null;
  }

  async findReference(
    workspaceId: string,
    scopeType: MemoryScopeType,
    scopeId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<MemoryEntry | null> {
    const row = await this.prisma.memoryEntry.findFirst({
      where: { workspaceId, scopeType, scopeId, sourceType, sourceId },
    });
    return row ? MemoryMapper.toDomain(row) : null;
  }

  async search(filter: SearchMemoryFilter): Promise<MemoryEntry[]> {
    const rows = await this.prisma.memoryEntry.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.scopeType && { scopeType: filter.scopeType }),
        ...(filter.scopeId && { scopeId: filter.scopeId }),
        ...(filter.type && { type: filter.type }),
        ...(filter.author && {
          authorType: filter.author.type,
          authorId: filter.author.actorId,
        }),
        ...(filter.tag && { tags: { array_contains: filter.tag } }),
        ...(filter.includeSuperseded
          ? {}
          : { supersededById: null, forgottenAt: null }),
      },
      orderBy: { createdAt: "desc" },
      // Memory accumulates and nothing prunes it: an unfiltered read is a
      // page, never the whole of it.
      take: pageSize(filter.limit, {
        fallback: DEFAULT_MEMORY_PAGE,
        ceiling: MAX_MEMORY_PAGE,
      }),
    });
    return rows.map((row) => MemoryMapper.toDomain(row));
  }

  async listForScopes(
    workspaceId: string,
    scopes: readonly { scopeType: MemoryScopeType; scopeId: string }[],
  ): Promise<MemoryEntry[]> {
    if (scopes.length === 0) {
      return [];
    }
    const rows = await this.prisma.memoryEntry.findMany({
      where: {
        workspaceId,
        supersededById: null,
        forgottenAt: null,
        OR: scopes.map((scope) => ({
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
        })),
      },
      orderBy: { createdAt: "asc" },
      // Bounded by what the context builder can keep anyway: fetching a
      // workspace's whole memory to retain 25 entries per level is work
      // nobody sees and everybody pays for.
      take: pageSize(scopes.length * PER_SCOPE_LIMIT, { ceiling: MAX_MEMORY_PAGE }),
    });
    return rows.map((row) => MemoryMapper.toDomain(row));
  }
}
