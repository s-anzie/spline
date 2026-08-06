/**
 * The hub's read models, as this console consumes them.
 *
 * These are hand-written rather than generated on purpose: the hub answers
 * with a *view* per route, and the shapes differ between the list and the
 * detail of the same thing (a run's list entry has no `allowedStatusTargets`
 * worth acting on, a task's list entry has its blockers already inlined).
 * Writing them down is what makes those differences visible instead of a
 * runtime surprise.
 *
 * Every route below is workspace-scoped except the two that structurally
 * cannot be: signing in, and the machines waiting to be paired — a machine
 * belongs to no workspace until somebody approves it.
 */

import { hub, type HubResult } from "./hub";
import type { Organization } from "./store";

export interface Actor {
  type: string;
  id: string;
}

/** §20.6 — the hub says what would work; a screen offers exactly that. */
export interface Affordable {
  allowedStatusTargets: string[];
}

export interface GoalView extends Affordable {
  id: string;
  parentGoalId: string | null;
  title: string;
  description: string | null;
  successCriteria: string[];
  dependsOnGoalIds: string[];
  priority: string;
  owner: Actor;
  progress: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface BlockerView {
  id: string;
  type: string;
  description: string;
  reportedBy: Actor;
  reportedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface TaskView extends Affordable {
  id: string;
  goalId: string | null;
  repositoryId: string | null;
  title: string;
  description: string | null;
  acceptanceCriteria: string[];
  dependsOnTaskIds: string[];
  assignee: Actor;
  priority: string;
  status: string;
  blockers: BlockerView[];
  openBlockerCount: number;
  estimatedCost: number | null;
  estimatedDurationMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttemptView {
  number: number;
  provider: string;
  model: string | null;
  promptVersion: string | null;
  /** §4.8 — what a resume would resume. Shown, because it is the reason. */
  providerSessionId: string | null;
  tokenUsage: Record<string, number> | null;
  cost: number | null;
  durationMs: number | null;
  outcome: string | null;
}

export interface RunView extends Affordable {
  runId: string;
  taskId: string;
  attemptNumber: number;
  workerId: string | null;
  status: string;
  failureReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: AttemptView[];
}

export interface WorkerView extends Affordable {
  id: string;
  hostname: string;
  architecture: string;
  operatingSystem: string;
  capabilities: string[];
  labels: string[];
  status: string;
  /** Judged at read against the heartbeat, not by a sweep that can be late. */
  stale: boolean;
  lastHeartbeatAt: string | null;
}

export interface SessionView extends Affordable {
  id: string;
  agent: Actor;
  workerId: string;
  provider: string;
  model: string | null;
  taskId: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
}

export interface CommandView extends Affordable {
  id: string;
  workerId: string;
  type: string;
  status: string;
  claimedBy: string | null;
  result: Record<string, unknown> | null;
  failureReason: string | null;
}

export interface ProviderView {
  id: string;
  provider: string;
  capabilities: string[];
  available: boolean;
  quotaUnavailableUntil: string | null;
  quotaReason: string | null;
  effectiveAvailable: boolean;
}

/**
 * §6.3 — a machine this organization owns, and the workspaces it serves.
 *
 * Distinct from `WorkerView`, which is a machine seen FROM a workspace it
 * already serves. This one exists to answer the question that list cannot:
 * what else do I have?
 */
export interface FleetView {
  id: string;
  hostname: string;
  architecture: string;
  operatingSystem: string;
  capabilities: string[];
  labels: string[];
  status: string;
  /** Judged at read against the heartbeat, like the workspace's own list. */
  stale: boolean;
  lastHeartbeatAt: string | null;
  serves: string[];
}

export interface EnrolmentView {
  enrolmentId: string;
  hostname: string;
  architecture: string;
  operatingSystem: string;
  capabilities: string[];
  labels: string[];
  requestedAt: string;
  expired: boolean;
}

export interface EventView {
  id: string;
  workspaceId: string | null;
  type: string;
  severity: string;
  actor: Actor | null;
  target: Actor;
  payload: Record<string, unknown>;
  sequence: string;
  createdAt: string;
}

export interface NotificationView {
  id: string;
  kind: string;
  scope: string;
  taskId: string | null;
  from: Actor | null;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  createdBy: Actor;
  createdAt: string;
}

export interface RecipientView extends Affordable {
  id: string;
  notificationId: string;
  deliveryStatus: string;
  deliveredAt: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  actionTakenAt: string | null;
  failureReason: string | null;
  notification: NotificationView;
}

export interface HealthSignalView {
  probe: string;
  level: string;
  reason: string;
  count: number;
  resources: { id: string; type: string; since: string; degradedForMs: number }[];
  /** §17.7 — which window was applied, and whether a policy set it. */
  threshold: { ms: number; source: "policy" | "default" } | null;
}

export interface HealthView {
  workspaceId: string;
  level: string;
  totalDegraded: number;
  signals: HealthSignalView[];
  assessedAt: string;
}

export interface LockView {
  id: string;
  resource: Actor;
  owner: Actor;
  reason: string | null;
  status: string;
  /** Computed against the lease at read — a stored status can lag. */
  active: boolean;
  acquiredAt: string;
  expiresAt: string;
  releasedAt: string | null;
}

export interface DecisionView {
  id: string;
  taskId: string | null;
  subject: string;
  rationale: string;
  alternatives: { option: string; rejectedBecause: string }[];
  outcome: string;
  confidence: string;
  author: Actor;
  supersededByDecisionId: string | null;
  isSuperseded: boolean;
  decidedAt: string;
}

/** §18.2 — a non-human identity, as the registry holds it. */
export interface ActorView {
  credentialId: string;
  actorType: string;
  actorId: string;
  displayName: string;
  revoked: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MemberView {
  membershipId: string;
  actorType: string;
  actorId: string;
  role: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string;
}

export interface SecretView {
  name: string;
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
  /** The one thing that makes a secret list worth reading: was it used. */
  lastAccessedAt: string | null;
}

export interface PolicyView {
  id: string;
  scope: Actor;
  type: string;
  rule: string;
  value: Record<string, unknown>;
  enabled: boolean;
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleView {
  ready: {
    taskId: string;
    goalId: string | null;
    title: string;
    priority: string;
    /** How many other tasks this one is holding up. The reason to pick it. */
    unblocks: number;
    assignee: Actor | null;
  }[];
  /** §17.8 — not "not ready", but held by what, named. */
  waiting: {
    taskId: string;
    title: string;
    blockedBy: { id: string; reason: string }[];
  }[];
  cycles: string[][];
  summary: {
    readyCount: number;
    waitingCount: number;
    inFlightCount: number;
    /**
     * §9.16 — the one flag that keeps a quiet system from looking finished.
     * Nothing to do because everything is done and nothing to do because
     * everything is stuck produce the same empty list.
     */
    nothingToDo: boolean;
  };
}

/**
 * §10.18a — a bounded exchange between two actors.
 *
 * OpenClaw's `sessions_spawn` in this system's own vocabulary: ask somebody
 * to do something and be told what came of it, with a ceiling on the turns
 * so two parties that are not converging stop rather than loop.
 */
export interface ThreadView extends Affordable {
  threadId: string;
  subject: string;
  initiator: Actor;
  participant: Actor;
  /** Set when this thread delegated a task and is waiting on its answer. */
  taskId: string | null;
  status: string;
  turnBudget: number;
  /** Shown before spending one: a budget you learn about after is a trap. */
  turnsLeft: number;
  awaiting: boolean;
  outcome: Record<string, unknown> | null;
  turns: { actor: Actor; message: string; at: string }[];
}

/**
 * §16 — something this workspace settled, so nobody has to settle it twice.
 *
 * An entry is a note OR a pointer at something that already exists elsewhere:
 * memory is never a source of truth, and copying one would create a second.
 */
export interface MemoryView {
  id: string;
  scope: Actor;
  type: string;
  title: string;
  content: string | null;
  source: Actor | null;
  tags: string[];
  author: Actor;
  supersededById: string | null;
  /** False once something newer replaced it. Kept, never deleted. */
  current: boolean;
  createdAt: string;
}

export interface CheckInView {
  actor: Actor;
  silentForMs: number | null;
  reason: string;
}

/** The hub's own vocabularies, so a form never offers what would be refused. */
export const PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW", "BACKGROUND"] as const;
export const WORKSPACE_ROLES = [
  "OWNER",
  "HUMAN_OPERATOR",
  "AGENT_MANAGER",
  "AGENT_CONTRIBUTOR",
  "READ_ONLY_AGENT",
  "VIEWER",
] as const;

/** What each role can do, said in words rather than left to the name. */
export const ROLE_MEANS: Record<(typeof WORKSPACE_ROLES)[number], string> = {
  OWNER: "everything, including the workspace itself and its machines",
  HUMAN_OPERATOR: "runs the work: dispatches, validates, pairs machines",
  AGENT_MANAGER: "plans and assigns work, cannot operate machines",
  AGENT_CONTRIBUTOR: "executes what it is assigned, asks for validation",
  READ_ONLY_AGENT: "reads the workspace and records decisions, changes nothing",
  VIEWER: "reads, and nothing else",
};

const q = (params: Record<string, string | number | undefined>): string => {
  const pairs = Object.entries(params).filter(([, value]) => value !== undefined);
  return pairs.length
    ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`
    : "";
};

/**
 * One function per route the console uses. Nothing here builds a path from a
 * value the hub did not give us, and nothing takes a base URL — both are how
 * a console ends up talking to somebody else's hub.
 */
export interface RepositoryView {
  id: string;
  workspaceId: string;
  name: string;
  origin: string;
  localPath: string | null;
  defaultBranch: string;
  protectedBranches: string[];
  status: string;
  createdAt: string;
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  status: string;
  settings: Record<string, unknown>;
}

export const api = {
  /** The two routes a stranger may call: they create the account and the org. */
  auth: {
    register: (body: { email: string; password: string; displayName: string }) =>
      hub.post<{ userId: string; organizationId: string }>("/auth/register", body),
    me: () =>
      hub.get<{
        actorType: string;
        actorId: string;
        displayName: string | null;
        email: string | null;
      }>("/auth/me"),
    /** The name, and only the name: the email is what you sign in with. */
    rename: (displayName: string) => hub.patch("/auth/me", { displayName }),
  },

  organizations: {
    list: () => hub.get<Organization[]>("/organizations"),
    rename: (organizationId: string, name: string) =>
      hub.patch(`/organizations/${organizationId}`, { name }),
  },

  workspaces: {
    create: (body: { organizationId: string; name: string; description?: string }) =>
      hub.post<{ workspaceId: string; slug: string }>("/workspaces", body),
    get: (workspace: string) => hub.get<WorkspaceDetail>(`/workspaces/${workspace}`),
    /**
     * §9 — the settings bag, which until automation nothing read. Sent whole
     * because it is a bag: merging on the client and posting the result is
     * what keeps a key nobody knows about from being dropped.
     */
    update: (workspace: string, body: { settings?: Record<string, unknown> }) =>
      hub.patch(`/workspaces/${workspace}`, body),
  },

  /** §18.2 — the registry of non-human actors: agents and services. */
  actors: {
    list: (organizationId: string) =>
      hub.get<ActorView[]>(`/organizations/${organizationId}/actors`),
    /** The token comes back once and is never retrievable again. */
    create: (organizationId: string, body: { actorType: string; displayName: string }) =>
      hub.post<{ actorId: string; credentialId: string; token: string }>(
        `/organizations/${organizationId}/actors`,
        body,
      ),
    revoke: (organizationId: string, credentialId: string) =>
      hub.post(`/organizations/${organizationId}/actors/${credentialId}/revoke`, {}),
  },

  members: {
    list: (workspace: string) => hub.get<MemberView[]>(`/workspaces/${workspace}/members`),
    /** Humans join by email; every other actor by explicit reference. */
    invite: (
      workspace: string,
      body: { role: string; email?: string; actorType?: string; actorId?: string },
    ) => hub.post<{ membershipId: string }>(`/workspaces/${workspace}/members`, body),
    changeRole: (workspace: string, membershipId: string, role: string) =>
      hub.patch(`/workspaces/${workspace}/members/${membershipId}`, { role }),
    revoke: (workspace: string, membershipId: string) =>
      hub.del(`/workspaces/${workspace}/members/${membershipId}`),
  },

  goals: {
    create: (
      workspace: string,
      body: {
        title: string;
        description?: string;
        successCriteria: string[];
        priority?: string;
        parentGoalId?: string;
      },
    ) => hub.post<{ goalId: string }>(`/workspaces/${workspace}/goals`, body),
    list: (workspace: string) =>
      hub.get<GoalView[]>(`/workspaces/${workspace}/goals`),
    get: (workspace: string, goalId: string) =>
      hub.get<GoalView>(`/workspaces/${workspace}/goals/${goalId}`),
    setStatus: (workspace: string, goalId: string, status: string) =>
      hub.post(`/workspaces/${workspace}/goals/${goalId}/status`, { status }),
    complete: (workspace: string, goalId: string) =>
      hub.post(`/workspaces/${workspace}/goals/${goalId}/complete`),
  },

  tasks: {
    list: (workspace: string, filters: { goalId?: string; status?: string } = {}) =>
      hub.get<TaskView[]>(`/workspaces/${workspace}/tasks${q(filters)}`),
    get: (workspace: string, taskId: string) =>
      hub.get<TaskView>(`/workspaces/${workspace}/tasks/${taskId}`),
    create: (
      workspace: string,
      body: {
        goalId: string;
        title: string;
        description?: string;
        /** Mandatory: §4.6 — a task is assigned from its first instant. */
        acceptanceCriteria: string[];
        assigneeType: string;
        assigneeId: string;
        priority?: string;
        /** §8.3 — the project this is worked on in, when it is worked on in one. */
        repositoryId?: string;
      },
    ) => hub.post<{ taskId: string }>(`/workspaces/${workspace}/tasks`, body),
    setStatus: (workspace: string, taskId: string, status: string) =>
      hub.post(`/workspaces/${workspace}/tasks/${taskId}/status`, { status }),
    /**
     * §11.7 — submitting IS asking for proof.
     *
     * Moving a task to VALIDATING with the plain status route only makes it
     * pass through a step named validation; nothing records what proof was
     * expected, so `required_validations` never materialises and completion
     * finds nothing missing. This route asks, and the policy adds whatever it
     * mandates on top of what the caller names.
     */
    submit: (workspace: string, taskId: string, validations: string[] = []) =>
      hub.post(`/workspaces/${workspace}/tasks/${taskId}/submit`, { validations }),
    /**
     * §4.24 — the ONE path to COMPLETED. `allowedStatusTargets` deliberately
     * never lists it, so an agent cannot declare its own success by moving a
     * status: an agent submits, a person approves, and the hub checks the
     * proof before it agrees.
     */
    complete: (workspace: string, taskId: string) =>
      hub.post(`/workspaces/${workspace}/tasks/${taskId}/complete`, {}),
    assign: (workspace: string, taskId: string, assignee: Actor) =>
      hub.post(`/workspaces/${workspace}/tasks/${taskId}/assign`, {
        assigneeType: assignee.type,
        assigneeId: assignee.id,
      }),
    resolveBlocker: (
      workspace: string,
      taskId: string,
      blockerId: string,
      resolution: string,
    ) =>
      hub.post(
        `/workspaces/${workspace}/tasks/${taskId}/blockers/${blockerId}/resolve`,
        { resolution },
      ),
  },

  runs: {
    list: (workspace: string, filters: { taskId?: string; limit?: number } = {}) =>
      hub.get<RunView[]>(`/workspaces/${workspace}/runs${q(filters)}`),
    get: (workspace: string, runId: string) =>
      hub.get<RunView>(`/workspaces/${workspace}/runs/${runId}`),
    retry: (workspace: string, taskId: string) =>
      hub.post<{ runId: string }>(`/workspaces/${workspace}/runs/retry`, { taskId }),
  },

  runtime: {
    workers: (workspace: string) =>
      hub.get<WorkerView[]>(`/workspaces/${workspace}/runtime/workers`),
    sessions: (workspace: string, limit = 50) =>
      hub.get<SessionView[]>(`/workspaces/${workspace}/runtime/sessions${q({ limit })}`),
    commands: (workspace: string, limit = 50) =>
      hub.get<CommandView[]>(`/workspaces/${workspace}/runtime/commands${q({ limit })}`),
    providers: () => hub.get<ProviderView[]>(`/runtime/providers`),
    /**
     * §4.14 — a provider is declared unavailable, never guessed at. RESTORE
     * brings it back; QUOTA_EXHAUSTED says when it comes back by itself.
     */
    setAvailability: (
      provider: string,
      body: { action: "RESTORE" | "DISABLE" | "QUOTA_EXHAUSTED"; until?: string; reason?: string },
    ) => hub.post(`/runtime/providers/${provider}/availability`, body),
    /** §6.8 — handing a task to a machine is a human act, so it lives here. */
    dispatch: (
      workspace: string,
      body: { taskId: string; provider: string; workerId?: string; model?: string },
    ) => hub.post<{ commandId: string }>(`/workspaces/${workspace}/runtime/dispatch`, body),
    attachWorker: (workspace: string, workerId: string) =>
      hub.post(`/workspaces/${workspace}/runtime/workers`, { workerId }),
    detachWorker: (workspace: string, workerId: string) =>
      hub.post(`/workspaces/${workspace}/runtime/workers/${workerId}/detach`, {}),
    recover: (workspace: string) =>
      hub.post(`/workspaces/${workspace}/runtime/recover`, {}),
  },

  /** The operator's own machines, whichever workspaces they serve. */
  fleet: (organizationId: string) =>
    hub.get<FleetView[]>(`/organizations/${organizationId}/workers`),

  enrolments: {
    pending: (organizationId: string) =>
      hub.get<EnrolmentView[]>(`/organizations/${organizationId}/enrolments`),
    /**
     * The code is typed by the operator, never listed by the hub: it is what
     * proves the person approving is looking at that machine's own console.
     */
    decide: (organizationId: string, code: string, approve: boolean) =>
      hub.post<{ hostname: string }>(`/organizations/${organizationId}/enrolments/decide`, {
        code,
        approve,
      }),
  },

  memory: {
    list: (workspace: string, filters: { scopeType?: string; type?: string } = {}) =>
      hub.get<MemoryView[]>(`/workspaces/${workspace}/memory${q(filters)}`),
    remember: (
      workspace: string,
      body: {
        scopeType: string;
        scopeId: string;
        type: string;
        title: string;
        content?: string;
        tags?: string[];
        supersedes?: string;
      },
    ) => hub.post<{ entryId: string }>(`/workspaces/${workspace}/memory`, body),
    /** §16 — forgetting is recorded, not erased. The entry stops being current. */
    forget: (workspace: string, entryId: string) =>
      hub.post(`/workspaces/${workspace}/memory/${entryId}/forget`, {}),
  },

  threads: {
    mine: (workspace: string, limit = 50) =>
      hub.get<ThreadView[]>(`/workspaces/${workspace}/threads/mine${q({ limit })}`),
    get: (workspace: string, threadId: string) =>
      hub.get<ThreadView>(`/workspaces/${workspace}/threads/${threadId}`),
    open: (
      workspace: string,
      body: {
        participantType: string;
        participantId: string;
        subject: string;
        taskId?: string;
        /** §4.5 — hand it over as work rather than asking a question about it. */
        handOver?: boolean;
      },
    ) => hub.post<{ threadId: string; taskId?: string }>(
      `/workspaces/${workspace}/threads`,
      body,
    ),
    /** A message is a turn; no message is "I have nothing to add", which ends it. */
    speak: (workspace: string, threadId: string, message?: string) =>
      hub.post(
        `/workspaces/${workspace}/threads/${threadId}/turns`,
        message ? { message } : {},
      ),
  },

  events: {
    list: (workspace: string, limit = 100) =>
      hub.get<EventView[]>(`/workspaces/${workspace}/events${q({ limit })}`),
    /**
     * The journal above every workspace, newest first — pairings, identities,
     * the organization itself. Not a roll-up of the workspaces below: their
     * facts are read in them (§4.2), and the two lists share no row.
     */
    organization: (organization: string, limit = 100) =>
      hub.get<EventView[]>(`/organizations/${organization}/events${q({ limit })}`),
  },

  notifications: {
    /** No `limit`: this route takes `kind` and `taskId`, and the hub refuses
     *  query parameters it did not declare. */
    list: (workspace: string) =>
      hub.get<NotificationView[]>(`/workspaces/${workspace}/notifications`),
    unread: (workspace: string) =>
      hub.get<RecipientView[]>(`/workspaces/${workspace}/notifications/unread/mine`),
    mark: (workspace: string, notificationId: string, status: string) =>
      hub.post(`/workspaces/${workspace}/notifications/${notificationId}/mine`, { status }),
  },

  health: (workspace: string) => hub.get<HealthView>(`/workspaces/${workspace}/health`),

  schedule: {
    get: (workspace: string) => hub.get<ScheduleView>(`/workspaces/${workspace}/schedule`),
    checkIns: (workspace: string) =>
      hub.get<CheckInView[]>(`/workspaces/${workspace}/schedule/check-ins`),
  },

  /**
   * §8.3 — the repositories a workspace's tasks may work in.
   *
   * Registering one is what turns the whole git side on: until a task names a
   * repository, an agent gets a bare directory and no branch, which is what
   * every task got before repositories were carried through at all.
   */
  repositories: {
    list: (workspace: string) =>
      hub.get<RepositoryView[]>(`/workspaces/${workspace}/repositories`),
    register: (
      workspace: string,
      body: {
        name: string;
        /** Optional: a project that lives only on disk has no address. */
        origin?: string;
        localPath?: string;
        defaultBranch?: string;
        protectedBranches?: string[];
      },
    ) =>
      hub.post<{ repositoryId: string }>(`/workspaces/${workspace}/repositories`, body),
  },

  locks: (workspace: string) => hub.get<LockView[]>(`/workspaces/${workspace}/locks`),
  releaseLock: (workspace: string, lockId: string) =>
    hub.post(`/workspaces/${workspace}/locks/${lockId}`, {}),

  decisions: (workspace: string) =>
    hub.get<DecisionView[]>(`/workspaces/${workspace}/decisions`),

  policies: {
    list: (workspace: string) =>
      hub.get<PolicyView[]>(`/workspaces/${workspace}/policies`),
    set: (
      workspace: string,
      body: {
        scopeType: string;
        scopeId: string;
        type: string;
        rule: string;
        value: unknown;
      },
    ) => hub.post<{ policyId: string }>(`/workspaces/${workspace}/policies`, body),
    disable: (workspace: string, policyId: string) =>
      hub.post(`/workspaces/${workspace}/policies/${policyId}/disable`, {}),
  },

  secrets: {
    list: (workspace: string) =>
      hub.get<SecretView[]>(`/workspaces/${workspace}/secrets`),
    /** §18.4 — the value goes in here and never comes back out. */
    set: (workspace: string, name: string, value: string) =>
      hub.post(`/workspaces/${workspace}/secrets`, { name, value }),
    remove: (workspace: string, name: string) =>
      hub.del(`/workspaces/${workspace}/secrets/${name}`),
  },
};

export type { HubResult };
