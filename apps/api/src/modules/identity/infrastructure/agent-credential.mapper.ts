import { AgentCredential as PrismaAgentCredential } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentCredential } from "../domain/agent-credential";

export class AgentCredentialMapper {
  static toDomain(record: PrismaAgentCredential): AgentCredential {
    return AgentCredential.create(
      {
        agentId: record.agentId,
        tokenHash: record.tokenHash,
        createdAt: record.createdAt,
        revokedAt: record.revokedAt ?? undefined,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(credential: AgentCredential): PrismaAgentCredential {
    return {
      id: credential.id.toString(),
      agentId: credential.agentId,
      tokenHash: credential.tokenHash,
      createdAt: credential.createdAt,
      revokedAt: credential.revokedAt ?? null,
    };
  }
}
