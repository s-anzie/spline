import { Injectable } from "@nestjs/common";
import { AuditEntry as AuditRow } from "@repo/db";

import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { AuditEntry } from "../domain/audit-entry";
import {
  AuditRepository,
  DEFAULT_AUDIT_PAGE,
  ListAuditFilter,
  MAX_AUDIT_PAGE,
} from "../domain/ports/audit.repository.port";

export const AuditMapper = {
  toDomain(row: AuditRow): AuditEntry {
    return AuditEntry.reconstitute(
      {
        workspaceId: row.workspaceId,
        actor: ActorRef.create(row.actorType as ActorType, row.actorId).value,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        before: (row.before ?? null) as Record<string, unknown> | null,
        after: (row.after ?? null) as Record<string, unknown> | null,
        sequence: row.sequence,
        signature: row.signature,
        createdAt: row.createdAt,
      },
      row.id,
    );
  },
};

/**
 * Append-only by construction: no update, no delete, not even privately.
 *
 * Appending happens inside a transaction because the signature depends on the
 * previous entry's: two concurrent appends reading the same predecessor would
 * produce two entries claiming the same place in the chain, and verification
 * would then report a break that nobody caused.
 */
@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    entry: AuditEntry,
    sign: (entry: AuditEntry, previousSignature: string) => string,
  ): Promise<AuditEntry> {
    return this.prisma.$transaction(async (tx) => {
      // Serialise appends for this workspace's chain: without it the "previous
      // signature" read below is a race.
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `audit:${entry.workspaceId ?? "global"}`,
      );

      const previous = await tx.auditEntry.findFirst({
        where: { workspaceId: entry.workspaceId },
        orderBy: { sequence: "desc" },
        select: { signature: true },
      });

      const created = await tx.auditEntry.create({
        data: {
          id: entry.id.value,
          workspaceId: entry.workspaceId,
          actorType: entry.actor.type,
          actorId: entry.actor.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          before: (entry.before ?? undefined) as object | undefined,
          after: (entry.after ?? undefined) as object | undefined,
          createdAt: entry.createdAt,
          // Placeholder: the sequence is assigned by the database, and the
          // signature covers it, so it can only be computed after insertion.
          signature: "",
        },
      });

      const signed = sign(AuditMapper.toDomain(created), previous?.signature ?? "");
      const stored = await tx.auditEntry.update({
        where: { id: created.id },
        data: { signature: signed },
      });
      return AuditMapper.toDomain(stored);
    });
  }

  async list(filter: ListAuditFilter): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditEntry.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.action && { action: filter.action }),
        ...(filter.targetType && { targetType: filter.targetType }),
        ...(filter.targetId && { targetId: filter.targetId }),
        ...(filter.actor && {
          actorType: filter.actor.type,
          actorId: filter.actor.actorId,
        }),
      },
      orderBy: { sequence: "desc" },
      take: Math.min(filter.limit ?? DEFAULT_AUDIT_PAGE, MAX_AUDIT_PAGE),
    });
    return rows.map((row) => AuditMapper.toDomain(row));
  }

  async listChain(workspaceId: string): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditEntry.findMany({
      where: { workspaceId },
      orderBy: { sequence: "asc" },
    });
    return rows.map((row) => AuditMapper.toDomain(row));
  }
}
