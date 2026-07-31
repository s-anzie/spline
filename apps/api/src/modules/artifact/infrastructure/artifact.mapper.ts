import { Artifact as PrismaArtifact, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Artifact, ArtifactVersionEntry } from "../domain/artifact";

export interface ArtifactPersistenceData {
  id: string;
  workspaceId: string;
  goalId: string | null;
  taskId: string | null;
  decisionId: string | null;
  processId: string | null;
  type: PrismaArtifact["type"];
  name: string;
  description: string | null;
  status: PrismaArtifact["status"];
  version: number;
  versions: Prisma.InputJsonValue;
  source: string | null;
  contentRef: string | null;
  checksum: string | null;
  createdByType: PrismaArtifact["createdByType"];
  createdById: string;
  updatedByType: PrismaArtifact["updatedByType"];
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ArtifactMapper {
  static toDomain(record: PrismaArtifact): Artifact {
    return Artifact.reconstitute(
      {
        workspaceId: record.workspaceId,
        goalId: record.goalId ?? undefined,
        taskId: record.taskId ?? undefined,
        decisionId: record.decisionId ?? undefined,
        processId: record.processId ?? undefined,
        type: record.type,
        name: record.name,
        description: record.description ?? undefined,
        status: record.status,
        version: record.version,
        versions: record.versions as unknown as ArtifactVersionEntry[],
        source: record.source ?? undefined,
        contentRef: record.contentRef ?? undefined,
        checksum: record.checksum ?? undefined,
        createdByType: record.createdByType,
        createdById: record.createdById,
        updatedByType: record.updatedByType ?? undefined,
        updatedById: record.updatedById ?? undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(artifact: Artifact): ArtifactPersistenceData {
    return {
      id: artifact.id.toString(),
      workspaceId: artifact.workspaceId,
      goalId: artifact.goalId ?? null,
      taskId: artifact.taskId ?? null,
      decisionId: artifact.decisionId ?? null,
      processId: artifact.processId ?? null,
      type: artifact.type,
      name: artifact.name,
      description: artifact.description ?? null,
      status: artifact.status,
      version: artifact.version,
      versions: artifact.versions as unknown as Prisma.InputJsonValue,
      source: artifact.source ?? null,
      contentRef: artifact.contentRef ?? null,
      checksum: artifact.checksum ?? null,
      createdByType: artifact.createdByType,
      createdById: artifact.createdById,
      updatedByType: artifact.updatedByType ?? null,
      updatedById: artifact.updatedById ?? null,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    };
  }
}
