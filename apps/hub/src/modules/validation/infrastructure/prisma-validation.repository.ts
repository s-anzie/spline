import { Injectable } from "@nestjs/common";
import { Validation as ValidationRow } from "@repo/db";

import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Validation, ValidationStatus } from "../domain/validation";
import {
  ListValidationsFilter,
  ValidationRepository,
} from "../domain/ports/validation.repository.port";

function actorOf(type: string | null, id: string | null): ActorRef | null {
  return type && id ? ActorRef.create(type as ActorType, id).value : null;
}

export const ValidationMapper = {
  toDomain(row: ValidationRow): Validation {
    return Validation.reconstitute(
      {
        workspaceId: row.workspaceId,
        taskId: row.taskId,
        type: row.type,
        status: row.status as ValidationStatus,
        mandatory: row.mandatory,
        requestedBy: ActorRef.create(
          row.requestedByType as ActorType,
          row.requestedById,
        ).value,
        executedBy: actorOf(row.executedByType, row.executedById),
        output: row.output,
        reportArtifactIds: (row.reportArtifactIds ?? []) as string[],
        dependsOnValidationIds: (row.dependsOnValidationIds ?? []) as string[],
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        invalidatedAt: row.invalidatedAt,
        invalidationReason: row.invalidationReason,
      },
      row.id,
    );
  },
};

@Injectable()
export class PrismaValidationRepository implements ValidationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole aggregate, never a hand-picked subset. */
  async save(validation: Validation): Promise<void> {
    const data = {
      workspaceId: validation.workspaceId,
      taskId: validation.taskId,
      type: validation.type,
      status: validation.status,
      mandatory: validation.mandatory,
      requestedByType: validation.requestedBy.type,
      requestedById: validation.requestedBy.actorId,
      executedByType: validation.executedBy?.type ?? null,
      executedById: validation.executedBy?.actorId ?? null,
      output: validation.output,
      reportArtifactIds: [...validation.reportArtifactIds],
      dependsOnValidationIds: [...validation.dependsOnValidationIds],
      createdAt: validation.createdAt,
      startedAt: validation.startedAt,
      finishedAt: validation.finishedAt,
      invalidatedAt: validation.invalidatedAt,
      invalidationReason: validation.invalidationReason,
    };
    await this.prisma.validation.upsert({
      where: { id: validation.id.value },
      create: { id: validation.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<Validation | null> {
    const row = await this.prisma.validation.findUnique({ where: { id } });
    return row ? ValidationMapper.toDomain(row) : null;
  }

  async list(filter: ListValidationsFilter): Promise<Validation[]> {
    const rows = await this.prisma.validation.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.taskId && { taskId: filter.taskId }),
        ...(filter.statuses && { status: { in: [...filter.statuses] } }),
        ...(filter.mandatoryOnly && { mandatory: true }),
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ValidationMapper.toDomain(row));
  }

  async listByTask(taskId: string): Promise<Validation[]> {
    const rows = await this.prisma.validation.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ValidationMapper.toDomain(row));
  }
}
