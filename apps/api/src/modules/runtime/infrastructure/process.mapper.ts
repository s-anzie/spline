import { Process as PrismaProcess, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Process } from "../domain/process";

export interface ProcessPersistenceData {
  id: string;
  workspaceId: string;
  name: string;
  command: string;
  cwd: string;
  env: Prisma.InputJsonValue;
  status: PrismaProcess["status"];
  ownerAgentId: string | null;
  ownerSessionId: string | null;
  machineId: string | null;
  pid: number | null;
  ports: Prisma.InputJsonValue;
  logsRef: string | null;
  restartPolicy: PrismaProcess["restartPolicy"];
  createdAt: Date;
  updatedAt: Date;
}

export class ProcessMapper {
  static toDomain(record: PrismaProcess): Process {
    return Process.reconstitute(
      {
        workspaceId: record.workspaceId,
        name: record.name,
        command: record.command,
        cwd: record.cwd,
        env: record.env as Record<string, string>,
        status: record.status,
        ownerAgentId: record.ownerAgentId ?? undefined,
        ownerSessionId: record.ownerSessionId ?? undefined,
        machineId: record.machineId ?? undefined,
        pid: record.pid ?? undefined,
        ports: record.ports as number[],
        logsRef: record.logsRef ?? undefined,
        restartPolicy: record.restartPolicy,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(process: Process): ProcessPersistenceData {
    return {
      id: process.id.toString(),
      workspaceId: process.workspaceId,
      name: process.name,
      command: process.command,
      cwd: process.cwd,
      env: process.env as unknown as Prisma.InputJsonValue,
      status: process.status,
      ownerAgentId: process.ownerAgentId ?? null,
      ownerSessionId: process.ownerSessionId ?? null,
      machineId: process.machineId ?? null,
      pid: process.pid ?? null,
      ports: process.ports as unknown as Prisma.InputJsonValue,
      logsRef: process.logsRef ?? null,
      restartPolicy: process.restartPolicy,
      createdAt: process.createdAt,
      updatedAt: process.updatedAt,
    };
  }
}
