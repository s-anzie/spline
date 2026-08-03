import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { AgentSession } from "../agent-session";

export const AGENT_SESSION_REPOSITORY = Symbol("AGENT_SESSION_REPOSITORY");

export interface AgentSessionRepository {
  findById(id: UniqueEntityId): Promise<AgentSession | null>;
  listByWorkspace(workspaceId: string): Promise<AgentSession[]>;
  /** Latest provider-native conversation that can safely be woken again. */
  findLatestReusableByAgent(
    agentId: string,
    provider: string,
  ): Promise<AgentSession | null>;
  /** Every non-terminal session for this agent — used to enforce "one active session per agent". */
  listActiveByAgent(agentId: string): Promise<AgentSession[]>;
  listActiveByMachine(machineId: string): Promise<AgentSession[]>;
  /** Every non-terminal session — used by boot-time reconciliation. */
  listActive(): Promise<AgentSession[]>;
  save(session: AgentSession): Promise<void>;
}
