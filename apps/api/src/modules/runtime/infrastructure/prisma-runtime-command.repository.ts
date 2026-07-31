import { RuntimeCommandStatus } from "@repo/db";
import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { RuntimeCommand } from "../domain/runtime-command";
import { RuntimeCommandRepository } from "../domain/ports/runtime-command.repository.port";
import { RuntimeCommandMapper } from "./runtime-command.mapper";

@Injectable()
export class PrismaRuntimeCommandRepository implements RuntimeCommandRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<RuntimeCommand | null> {
    const record = await this.prisma.runtimeCommand.findUnique({ where: { id: id.toString() } });
    return record ? RuntimeCommandMapper.toDomain(record) : null;
  }

  async listPendingByMachine(machineId: string): Promise<RuntimeCommand[]> {
    const records = await this.prisma.runtimeCommand.findMany({
      where: { machineId, status: RuntimeCommandStatus.PENDING },
      orderBy: { createdAt: "asc" },
    });
    return records.map(RuntimeCommandMapper.toDomain);
  }

  async save(command: RuntimeCommand): Promise<void> {
    const data = RuntimeCommandMapper.toPersistence(command);
    await this.prisma.runtimeCommand.upsert({
      where: { id: data.id },
      create: data,
      update: {
        status: data.status,
        completedAt: data.completedAt,
      },
    });
  }
}
