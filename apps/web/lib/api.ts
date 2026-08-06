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
  threshold: unknown;
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

export interface CheckInView {
  actor: Actor;
  silentForMs: number | null;
  reason: string;
}

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
export const api = {
  goals: {
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
        title: string;
        description?: string;
        goalId?: string;
        priority?: string;
        assigneeType: string;
        assigneeId: string;
      },
    ) => hub.post<{ taskId: string }>(`/workspaces/${workspace}/tasks`, body),
    setStatus: (workspace: string, taskId: string, status: string) =>
      hub.post(`/workspaces/${workspace}/tasks/${taskId}/status`, { status }),
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

  events: {
    list: (workspace: string, limit = 100) =>
      hub.get<EventView[]>(`/workspaces/${workspace}/events${q({ limit })}`),
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

  locks: (workspace: string) => hub.get<LockView[]>(`/workspaces/${workspace}/locks`),
  releaseLock: (workspace: string, lockId: string) =>
    hub.post(`/workspaces/${workspace}/locks/${lockId}`, {}),

  decisions: (workspace: string) =>
    hub.get<DecisionView[]>(`/workspaces/${workspace}/decisions`),

  members: (workspace: string) =>
    hub.get<MemberView[]>(`/workspaces/${workspace}/members`),

  secrets: (workspace: string) =>
    hub.get<SecretView[]>(`/workspaces/${workspace}/secrets`),

  policies: (workspace: string) =>
    hub.get<PolicyView[]>(`/workspaces/${workspace}/policies`),
};

export type { HubResult };
