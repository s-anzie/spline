import { Prisma, Workspace as PrismaWorkspace } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Workspace } from "../domain/workspace";

export interface WorkspacePersistenceData {
  id: string;
  name: string;
  description: string | null;
  status: PrismaWorkspace["status"];
  ruleset: Prisma.InputJsonValue;
  createdAt: Date;
  updatedAt: Date;
}

export class WorkspaceMapper {
  static toDomain(record: PrismaWorkspace): Workspace {
    return Workspace.reconstitute(
      {
        name: record.name,
        description: record.description ?? undefined,
        status: record.status,
        ruleset: record.ruleset as Record<string, unknown>,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(workspace: Workspace): WorkspacePersistenceData {
    return {
      id: workspace.id.toString(),
      name: workspace.name,
      description: workspace.description ?? null,
      status: workspace.status,
      ruleset: workspace.ruleset as Prisma.InputJsonValue,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }
}
