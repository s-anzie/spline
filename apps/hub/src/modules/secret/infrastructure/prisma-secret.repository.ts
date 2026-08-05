import { Injectable } from "@nestjs/common";
import { Secret as SecretRow } from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  SecretRepository,
} from "../domain/ports/secret.repository.port";
import { Secret } from "../domain/secret";

@Injectable()
export class PrismaSecretRepository implements SecretRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole aggregate. */
  async save(secret: Secret): Promise<void> {
    const data = {
      workspaceId: secret.workspaceId,
      name: secret.name,
      sealed: secret.sealed,
      createdByType: secret.createdBy.type,
      createdById: secret.createdBy.actorId,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
      lastAccessedAt: secret.lastAccessedAt,
    };
    await this.prisma.secret.upsert({
      where: { id: secret.id.value },
      create: { id: secret.id.value, ...data },
      update: data,
    });
  }

  async findByName(workspaceId: string, name: string): Promise<Secret | null> {
    const row = await this.prisma.secret.findUnique({
      where: { workspaceId_name: { workspaceId, name } },
    });
    return row ? toSecret(row) : null;
  }

  async findManyByName(
    workspaceId: string,
    names: readonly string[],
  ): Promise<Secret[]> {
    if (names.length === 0) {
      return [];
    }
    const rows = await this.prisma.secret.findMany({
      where: { workspaceId, name: { in: [...names] } },
      take: pageSize(names.length),
    });
    return rows.map(toSecret);
  }

  async listNames(workspaceId: string, limit?: number): Promise<Secret[]> {
    const rows = await this.prisma.secret.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      take: pageSize(limit),
    });
    return rows.map(toSecret);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.secret.deleteMany({ where: { id } });
  }
}

function toSecret(row: SecretRow): Secret {
  return Secret.reconstitute(
    {
      workspaceId: row.workspaceId,
      name: row.name,
      sealed: row.sealed,
      createdBy: ActorRef.create(row.createdByType as ActorType, row.createdById).value,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastAccessedAt: row.lastAccessedAt,
    },
    row.id,
  );
}
