import { AgentSession } from "../agent-session";
import { ProviderProfile } from "../provider-profile";
import { WorkerNode } from "../worker-node";

export interface WorkerStore {
  save(worker: WorkerNode): Promise<void>;
  findById(id: string): Promise<WorkerNode | null>;
  findByHostname(hostname: string): Promise<WorkerNode | null>;
  /** Machines serving one workspace — the only list a workspace may read. */
  listForWorkspace(workspaceId: string, limit?: number): Promise<WorkerNode[]>;
}
export const WORKER_STORE = "runtime/WorkerStore";

export interface ListSessionsFilter {
  /** Mandatory (§4.2): a session belongs to exactly one workspace. */
  workspaceId: string;
  workerId?: string;
  liveOnly?: boolean;
  limit?: number;
}

export interface SessionStore {
  save(session: AgentSession): Promise<void>;
  findById(id: string): Promise<AgentSession | null>;
  list(filter: ListSessionsFilter): Promise<AgentSession[]>;
}
export const SESSION_STORE = "runtime/SessionStore";

export interface ProviderStore {
  save(profile: ProviderProfile): Promise<void>;
  findById(id: string): Promise<ProviderProfile | null>;
  findByProvider(provider: string): Promise<ProviderProfile | null>;
  list(limit?: number): Promise<ProviderProfile[]>;
}
export const PROVIDER_STORE = "runtime/ProviderStore";
