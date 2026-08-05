import { AgentSession } from "../agent-session";
import { RuntimeCommand } from "../runtime-command";
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

export interface ListCommandsFilter {
  /** Mandatory (§4.2). */
  workspaceId: string;
  workerId?: string;
  pendingOnly?: boolean;
  limit?: number;
}

export interface CommandStore {
  save(command: RuntimeCommand): Promise<void>;
  findById(id: string): Promise<RuntimeCommand | null>;
  list(filter: ListCommandsFilter): Promise<RuntimeCommand[]>;
  /** What a worker may take next, oldest first — a queue, not a pile. */
  listPendingForWorker(workerId: string, limit: number): Promise<RuntimeCommand[]>;
  /** §17.7's third resource: claimed orders whose worker never came back. */
  listClaimed(workspaceId: string): Promise<RuntimeCommand[]>;
}
export const COMMAND_STORE = "runtime/CommandStore";
