import { ActorRef } from "../../../identity/domain/actor";
import { AgentSession } from "../agent-session";
import { RuntimeCommand } from "../runtime-command";
import { ProviderProfile } from "../provider-profile";
import { WorkerEnrolment } from "../worker-enrolment";
import { WorkerNode } from "../worker-node";

export interface WorkerStore {
  save(worker: WorkerNode): Promise<void>;
  findById(id: string): Promise<WorkerNode | null>;
  findByHostname(hostname: string): Promise<WorkerNode | null>;
  /** Machines serving one workspace — the only list a workspace may read. */
  listForWorkspace(workspaceId: string, limit?: number): Promise<WorkerNode[]>;
  /**
   * §6.3 — the machines an organization owns, whichever workspaces they serve
   * (including none). Named by the actors that registered them, because that
   * is what a credential binds.
   */
  listRegisteredBy(actorIds: readonly string[], limit?: number): Promise<WorkerNode[]>;
}
export const WORKER_STORE = "runtime/WorkerStore";

export interface ListSessionsFilter {
  /** Mandatory (§4.2): a session belongs to exactly one workspace. */
  workspaceId: string;
  workerId?: string;
  /**
   * §4.12 — the task this instance was opened for.
   *
   * Needed to end a session whose run died without anybody reporting: the
   * only thing the fact carries is the task, because the machine that held
   * the order is exactly the thing that stopped answering.
   */
  taskId?: string;
  /**
   * §17.7 — whose instance this is.
   *
   * A per-agent ceiling is counted with this: "how many instances of this
   * agent are live here". Without it there was no way to ask, and therefore
   * no way to cap.
   */
  agent?: ActorRef;
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

/** §6.3 — pending and decided pairing requests. */
export interface EnrolmentStore {
  save(enrolment: WorkerEnrolment): Promise<void>;
  findById(id: string): Promise<WorkerEnrolment | null>;
  /** The operator approves by the code the machine printed on its console. */
  findByCode(code: string): Promise<WorkerEnrolment | null>;
  /**
   * Still waiting, whatever their age: expiry is judged at read (§17.7), so
   * an expired request is listed and shown as expired rather than hidden.
   * A request nobody can see is a request nobody can reject.
   */
  listPending(organizationId: string, limit?: number): Promise<WorkerEnrolment[]>;
  /**
   * Every request this organization has ever been knocked on with, decided or
   * not. §14 reads it to say what the organization did, which includes the
   * ones it refused.
   */
  listForOrganization(organizationId: string, limit?: number): Promise<WorkerEnrolment[]>;
}
export const ENROLMENT_STORE = "runtime/EnrolmentStore";
