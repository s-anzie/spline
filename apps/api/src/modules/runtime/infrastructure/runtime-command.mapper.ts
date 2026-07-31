import { RuntimeCommand as PrismaRuntimeCommand, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { RuntimeCommand } from "../domain/runtime-command";

export interface RuntimeCommandPersistenceData {
  id: string;
  machineId: string;
  workspaceId: string;
  type: PrismaRuntimeCommand["type"];
  payload: Prisma.InputJsonValue;
  status: PrismaRuntimeCommand["status"];
  createdAt: Date;
  completedAt: Date | null;
}

export class RuntimeCommandMapper {
  static toDomain(record: PrismaRuntimeCommand): RuntimeCommand {
    return RuntimeCommand.reconstitute(
      {
        machineId: record.machineId,
        workspaceId: record.workspaceId,
        type: record.type,
        payload: record.payload as Record<string, unknown>,
        status: record.status,
        createdAt: record.createdAt,
        completedAt: record.completedAt ?? undefined,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(command: RuntimeCommand): RuntimeCommandPersistenceData {
    return {
      id: command.id.toString(),
      machineId: command.machineId,
      workspaceId: command.workspaceId,
      type: command.type,
      payload: command.payload as unknown as Prisma.InputJsonValue,
      status: command.status,
      createdAt: command.createdAt,
      completedAt: command.completedAt ?? null,
    };
  }
}
