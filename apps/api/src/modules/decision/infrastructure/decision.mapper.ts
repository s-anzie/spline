import { Decision as PrismaDecision, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Decision } from "../domain/decision";

export interface DecisionPersistenceData {
  id: string;
  workspaceId: string;
  subject: string;
  context: string | null;
  optionsConsidered: Prisma.InputJsonValue;
  decision: string;
  decidedByType: PrismaDecision["decidedByType"];
  decidedById: string;
  decidedAt: Date;
  confidence: number | null;
  references: Prisma.InputJsonValue;
}

export class DecisionMapper {
  static toDomain(record: PrismaDecision): Decision {
    return Decision.reconstitute(
      {
        workspaceId: record.workspaceId,
        subject: record.subject,
        context: record.context ?? undefined,
        optionsConsidered: record.optionsConsidered as string[],
        decision: record.decision,
        decidedByType: record.decidedByType,
        decidedById: record.decidedById,
        decidedAt: record.decidedAt,
        confidence: record.confidence ?? undefined,
        references: record.references as string[],
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(decision: Decision): DecisionPersistenceData {
    return {
      id: decision.id.toString(),
      workspaceId: decision.workspaceId,
      subject: decision.subject,
      context: decision.context ?? null,
      optionsConsidered: decision.optionsConsidered as unknown as Prisma.InputJsonValue,
      decision: decision.decision,
      decidedByType: decision.decidedByType,
      decidedById: decision.decidedById,
      decidedAt: decision.decidedAt,
      confidence: decision.confidence ?? null,
      references: decision.references as unknown as Prisma.InputJsonValue,
    };
  }
}
