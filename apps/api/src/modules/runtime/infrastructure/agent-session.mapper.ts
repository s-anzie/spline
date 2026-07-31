import { AgentSession as PrismaAgentSession } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentSession } from "../domain/agent-session";

export interface AgentSessionPersistenceData {
  id: string;
  agentId: string;
  provider: string;
  workspaceId: string;
  machineId: string;
  status: PrismaAgentSession["status"];
  startedAt: Date;
  lastHeartbeatAt: Date | null;
  currentProcessId: string | null;
  currentTaskId: string | null;
  approvalState: PrismaAgentSession["approvalState"];
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentSessionMapper {
  static toDomain(record: PrismaAgentSession): AgentSession {
    return AgentSession.reconstitute(
      {
        agentId: record.agentId,
        provider: record.provider,
        workspaceId: record.workspaceId,
        machineId: record.machineId,
        status: record.status,
        startedAt: record.startedAt,
        lastHeartbeatAt: record.lastHeartbeatAt ?? undefined,
        currentProcessId: record.currentProcessId ?? undefined,
        currentTaskId: record.currentTaskId ?? undefined,
        approvalState: record.approvalState,
        endedAt: record.endedAt ?? undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(session: AgentSession): AgentSessionPersistenceData {
    return {
      id: session.id.toString(),
      agentId: session.agentId,
      provider: session.provider,
      workspaceId: session.workspaceId,
      machineId: session.machineId,
      status: session.status,
      startedAt: session.startedAt,
      lastHeartbeatAt: session.lastHeartbeatAt ?? null,
      currentProcessId: session.currentProcessId ?? null,
      currentTaskId: session.currentTaskId ?? null,
      approvalState: session.approvalState,
      endedAt: session.endedAt ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
