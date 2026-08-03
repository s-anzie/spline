import { AgentSessionStatus } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { AgentSessionRepository } from "../../domain/ports/agent-session.repository.port";
import { AgentSession } from "../../domain/agent-session";

const TERMINAL_STATUSES: AgentSessionStatus[] = [
  AgentSessionStatus.COMPLETED,
  AgentSessionStatus.FAILED,
  AgentSessionStatus.CRASHED,
  AgentSessionStatus.STOPPED,
];

export class InMemoryAgentSessionRepository implements AgentSessionRepository {
  private readonly sessions = new Map<string, AgentSession>();

  async findById(id: UniqueEntityId): Promise<AgentSession | null> {
    return this.sessions.get(id.toString()) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<AgentSession[]> {
    return [...this.sessions.values()].filter((s) => s.workspaceId === workspaceId);
  }

  async findLatestReusableByAgent(
    agentId: string,
    provider: string,
  ): Promise<AgentSession | null> {
    const reusable: AgentSessionStatus[] = [
      AgentSessionStatus.IDLE,
      AgentSessionStatus.FAILED,
      AgentSessionStatus.CRASHED,
    ];
    return (
      [...this.sessions.values()]
        .filter(
          (session) =>
            session.agentId === agentId &&
            session.provider === provider &&
            Boolean(session.providerSessionId) &&
            reusable.includes(session.status),
        )
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ??
      null
    );
  }

  async listActiveByAgent(agentId: string): Promise<AgentSession[]> {
    return [...this.sessions.values()].filter(
      (s) => s.agentId === agentId && !TERMINAL_STATUSES.includes(s.status),
    );
  }

  async listActiveByMachine(machineId: string): Promise<AgentSession[]> {
    return [...this.sessions.values()].filter(
      (session) =>
        session.machineId === machineId &&
        !TERMINAL_STATUSES.includes(session.status),
    );
  }

  async listActive(): Promise<AgentSession[]> {
    return [...this.sessions.values()].filter((s) => !TERMINAL_STATUSES.includes(s.status));
  }

  async save(session: AgentSession): Promise<void> {
    this.sessions.set(session.id.toString(), session);
  }
}
