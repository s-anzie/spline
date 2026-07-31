import { LocalMachineRuntimeStatus } from "@repo/db";
import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { LocalMachine } from "../domain/local-machine";
import { LocalMachineRepository } from "../domain/ports/local-machine.repository.port";
import { LocalMachineMapper } from "./local-machine.mapper";

@Injectable()
export class PrismaLocalMachineRepository implements LocalMachineRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<LocalMachine | null> {
    const record = await this.prisma.localMachine.findUnique({ where: { id: id.toString() } });
    return record ? LocalMachineMapper.toDomain(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<LocalMachine[]> {
    const records = await this.prisma.localMachine.findMany({
      where: { workspaceIds: { array_contains: workspaceId } },
    });
    return records.map(LocalMachineMapper.toDomain);
  }

  async listActive(): Promise<LocalMachine[]> {
    const records = await this.prisma.localMachine.findMany({
      where: { runtimeStatus: { not: LocalMachineRuntimeStatus.OFFLINE } },
    });
    return records.map(LocalMachineMapper.toDomain);
  }

  async save(machine: LocalMachine): Promise<void> {
    const data = LocalMachineMapper.toPersistence(machine);
    await this.prisma.localMachine.upsert({
      where: { id: data.id },
      create: data,
      update: {
        hostname: data.hostname,
        os: data.os,
        workspaceIds: data.workspaceIds,
        runtimeStatus: data.runtimeStatus,
        lastSeenAt: data.lastSeenAt,
        updatedAt: data.updatedAt,
      },
    });
  }
}
