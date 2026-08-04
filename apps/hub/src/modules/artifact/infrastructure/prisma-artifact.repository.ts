import { Injectable } from "@nestjs/common";
import {
  Artifact as ArtifactRow,
  ArtifactVersion as ArtifactVersionRow,
  Prisma,
} from "@repo/db";

import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Artifact, ArtifactStatus, StoredArtifactVersion } from "../domain/artifact";
import {
  ArtifactRepository,
  ListArtifactsFilter,
} from "../domain/ports/artifact.repository.port";

type RowWithVersions = ArtifactRow & { versions: ArtifactVersionRow[] };

export const ArtifactMapper = {
  toDomain(row: RowWithVersions): Artifact {
    const versions: StoredArtifactVersion[] = [...row.versions]
      .sort((a, b) => a.version - b.version)
      .map((version) => ({
        version: version.version,
        checksum: version.checksum,
        storageRef: version.storageRef,
        sizeBytes: version.sizeBytes,
        createdByType: version.createdByType,
        createdById: version.createdById,
        createdAt: version.createdAt,
        note: version.note,
      }));

    return Artifact.reconstitute(
      {
        workspaceId: row.workspaceId,
        goalId: row.goalId,
        taskId: row.taskId,
        repositoryId: row.repositoryId,
        decisionId: row.decisionId,
        type: row.type,
        name: row.name,
        description: row.description,
        status: row.status as ArtifactStatus,
        versions,
        tags: (row.tags ?? []) as string[],
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        immutable: row.immutable,
        createdBy: ActorRef.create(row.createdByType as ActorType, row.createdById).value,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.id,
    );
  },

  toPersistence(
    artifact: Artifact,
  ): Omit<ArtifactRow, "tags" | "metadata"> & {
    tags: Prisma.JsonArray;
    metadata: Prisma.JsonObject;
  } {
    return {
      id: artifact.id.value,
      workspaceId: artifact.workspaceId,
      goalId: artifact.goalId,
      taskId: artifact.taskId,
      repositoryId: artifact.repositoryId,
      decisionId: artifact.decisionId,
      type: artifact.type,
      name: artifact.name,
      description: artifact.description,
      status: artifact.status,
      tags: [...artifact.tags],
      metadata: artifact.metadata as Prisma.JsonObject,
      immutable: artifact.immutable,
      createdByType: artifact.createdBy.type,
      createdById: artifact.createdBy.actorId,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    };
  },
};

/** §5.19: upserts the FULL mapped payload, never a hand-picked field list. */
@Injectable()
export class PrismaArtifactRepository implements ArtifactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(artifact: Artifact): Promise<void> {
    const data = ArtifactMapper.toPersistence(artifact);
    await this.prisma.$transaction(async (tx) => {
      await tx.artifact.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      });
      // Versions are append-only (§15.2): insert the new ones, never rewrite
      // the existing ones — an old version staying readable is the point.
      const known = await tx.artifactVersion.count({ where: { artifactId: data.id } });
      const missing = artifact.storedVersions.filter(
        (version) => version.version > known,
      );
      if (missing.length > 0) {
        await tx.artifactVersion.createMany({
          data: missing.map((version) => ({
            artifactId: data.id,
            version: version.version,
            checksum: version.checksum,
            storageRef: version.storageRef,
            sizeBytes: version.sizeBytes,
            note: version.note,
            createdByType: version.createdByType as ActorType,
            createdById: version.createdById,
            createdAt: version.createdAt,
          })),
        });
      }
    });
  }

  async findById(id: string): Promise<Artifact | null> {
    const row = await this.prisma.artifact.findUnique({
      where: { id },
      include: { versions: true },
    });
    return row ? ArtifactMapper.toDomain(row) : null;
  }

  async list(filter: ListArtifactsFilter): Promise<Artifact[]> {
    const rows = await this.prisma.artifact.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.type !== undefined && { type: filter.type }),
        ...(filter.goalId !== undefined && { goalId: filter.goalId }),
        ...(filter.taskId !== undefined && { taskId: filter.taskId }),
        ...(filter.repositoryId !== undefined && { repositoryId: filter.repositoryId }),
        ...(filter.statuses && { status: { in: [...filter.statuses] } }),
        ...(filter.createdBy && {
          createdByType: filter.createdBy.type,
          createdById: filter.createdBy.actorId,
        }),
        ...((filter.createdAfter || filter.createdBefore) && {
          createdAt: {
            ...(filter.createdAfter && { gte: filter.createdAfter }),
            ...(filter.createdBefore && { lte: filter.createdBefore }),
          },
        }),
      },
      include: { versions: true },
      orderBy: { createdAt: "desc" },
    });

    const artifacts = rows.map((row) => ArtifactMapper.toDomain(row));
    // Tags live in a JSON column, so the "has every tag" filter is applied in
    // memory — the workspace scope above already bounds the set.
    if (!filter.tags?.length) {
      return artifacts;
    }
    return artifacts.filter((artifact) =>
      filter.tags!.every((tag) => artifact.tags.includes(tag)),
    );
  }
}
