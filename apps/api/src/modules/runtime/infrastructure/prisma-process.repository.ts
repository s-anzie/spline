import { ProcessStatus } from "@repo/db";
import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { Process } from "../domain/process";
import { ProcessRepository } from "../domain/ports/process.repository.port";
import { ProcessMapper } from "./process.mapper";

const ACTIVE_STATUSES: ProcessStatus[] = [ProcessStatus.STARTING, ProcessStatus.RUNNING, ProcessStatus.STOPPING];

@Injectable()
export class PrismaProcessRepository implements ProcessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<Process | null> {
    const record = await this.prisma.process.findUnique({ where: { id: id.toString() } });
    return record ? ProcessMapper.toDomain(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<Process[]> {
    const records = await this.prisma.process.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(ProcessMapper.toDomain);
  }

  async listActive(): Promise<Process[]> {
    const records = await this.prisma.process.findMany({ where: { status: { in: ACTIVE_STATUSES } } });
    return records.map(ProcessMapper.toDomain);
  }

  async save(process: Process): Promise<void> {
    const data = ProcessMapper.toPersistence(process);
    await this.prisma.process.upsert({
      where: { id: data.id },
      create: data,
      // Full spread — see PrismaTaskRepository.save() for why a hand-picked
      // field list here is a recurring source of silently-dropped updates.
      update: data,
    });
  }
}
