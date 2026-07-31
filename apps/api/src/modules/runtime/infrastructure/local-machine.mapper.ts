import { LocalMachine as PrismaLocalMachine, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { LocalMachine } from "../domain/local-machine";

export interface LocalMachinePersistenceData {
  id: string;
  hostname: string;
  os: string;
  workspaceIds: Prisma.InputJsonValue;
  runtimeStatus: PrismaLocalMachine["runtimeStatus"];
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class LocalMachineMapper {
  static toDomain(record: PrismaLocalMachine): LocalMachine {
    return LocalMachine.reconstitute(
      {
        hostname: record.hostname,
        os: record.os,
        workspaceIds: record.workspaceIds as string[],
        runtimeStatus: record.runtimeStatus,
        lastSeenAt: record.lastSeenAt ?? undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(machine: LocalMachine): LocalMachinePersistenceData {
    return {
      id: machine.id.toString(),
      hostname: machine.hostname,
      os: machine.os,
      workspaceIds: machine.workspaceIds as unknown as Prisma.InputJsonValue,
      runtimeStatus: machine.runtimeStatus,
      lastSeenAt: machine.lastSeenAt ?? null,
      createdAt: machine.createdAt,
      updatedAt: machine.updatedAt,
    };
  }
}
