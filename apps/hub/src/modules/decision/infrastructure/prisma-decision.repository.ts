import { Injectable } from "@nestjs/common";
import { Decision as DecisionRow, Prisma } from "@repo/db";

import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { ConsideredAlternative } from "../domain/considered-alternative";
import { Decision, DecisionConfidence } from "../domain/decision";
import {
  DecisionRepository,
  ListDecisionsFilter,
} from "../domain/ports/decision.repository.port";

export const DecisionMapper = {
  toDomain(row: DecisionRow): Decision {
    return Decision.reconstitute(
      {
        workspaceId: row.workspaceId,
        taskId: row.taskId,
        subject: row.subject,
        rationale: row.rationale,
        alternatives: (row.alternatives ?? []) as unknown as ConsideredAlternative[],
        outcome: row.outcome,
        confidence: row.confidence as DecisionConfidence,
        author: ActorRef.create(row.authorType as ActorType, row.authorId).value,
        supersededByDecisionId: row.supersededByDecisionId,
        decidedAt: row.decidedAt,
      },
      row.id,
    );
  },

  toPersistence(
    decision: Decision,
  ): Omit<DecisionRow, "alternatives"> & { alternatives: Prisma.JsonArray } {
    return {
      id: decision.id.value,
      workspaceId: decision.workspaceId,
      taskId: decision.taskId,
      subject: decision.subject,
      rationale: decision.rationale,
      alternatives: decision.alternatives.map((alternative) => ({ ...alternative })),
      outcome: decision.outcome,
      confidence: decision.confidence,
      authorType: decision.author.type,
      authorId: decision.author.actorId,
      supersededByDecisionId: decision.supersededByDecisionId,
      decidedAt: decision.decidedAt,
    };
  },
};

/** §5.19: upserts the FULL mapped payload, never a hand-picked field list. */
@Injectable()
export class PrismaDecisionRepository implements DecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(decision: Decision): Promise<void> {
    const data = DecisionMapper.toPersistence(decision);
    await this.prisma.decision.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<Decision | null> {
    const row = await this.prisma.decision.findUnique({ where: { id } });
    return row ? DecisionMapper.toDomain(row) : null;
  }

  async list(filter: ListDecisionsFilter): Promise<Decision[]> {
    const rows = await this.prisma.decision.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.taskId !== undefined && { taskId: filter.taskId }),
        ...(filter.confidences && { confidence: { in: [...filter.confidences] } }),
        ...(filter.author && {
          authorType: filter.author.type,
          authorId: filter.author.actorId,
        }),
        // Superseded reasoning is history: returned only when asked for.
        ...(!filter.includeSuperseded && { supersededByDecisionId: null }),
      },
      orderBy: { decidedAt: "desc" },
    });
    return rows.map((row) => DecisionMapper.toDomain(row));
  }
}
