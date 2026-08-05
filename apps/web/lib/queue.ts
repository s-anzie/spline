import { hub } from "./hub";

/**
 * §17.8 — what needs a person, named.
 *
 * The shape follows OpenClaw's own conclusion about their Control UI: it
 * became "a place to triage and intervene, rather than merely watch". A
 * console of charts tells an operator that something is happening; a queue
 * tells them what to do next.
 *
 * Every entry here is something the hub already knows and nothing else will
 * ever act on by itself. A count would be useless: "3 things need you" is not
 * a thing anybody can do.
 */
export type InterventionKind =
  | "enrolment"
  | "validation"
  | "blocked"
  | "silent"
  | "stuck";

export interface Intervention {
  kind: InterventionKind;
  /** What it is, in one line an operator can act on. */
  title: string;
  /** Why it is here. Never a status word on its own. */
  detail: string;
  /** Where to go. Null when the action is on this screen. */
  href: string | null;
  /** Set when acting is a single call, offered inline. */
  action?: { label: string; path: string; body?: Record<string, unknown> };
  /** Sorts the queue: what has waited longest is most likely forgotten. */
  since: string | null;
}

interface PendingEnrolment {
  enrolmentId: string;
  hostname: string;
  capabilities: string[];
  requestedAt: string;
  expired: boolean;
}

interface RunView {
  runId: string;
  taskId: string;
  status: string;
  attempts: { provider: string; cost: number | null }[];
  startedAt: string | null;
}

interface TaskView {
  taskId: string;
  title: string;
  status: string;
  blockers?: { description: string; resolvedAt: string | null }[];
}

interface CheckIn {
  actor: { type: string; id: string };
  silentForMs: number | null;
  reason: string;
}

interface CommandView {
  id: string;
  type: string;
  status: string;
  claimedBy: string | null;
}

/**
 * Gathers the queue. Failures are silent per source on purpose: a console
 * that showed nothing because one of five lists failed would hide four lists
 * that were fine.
 */
export async function loadQueue(
  organizationId: string | null,
  workspaceId: string,
): Promise<Intervention[]> {
  const [enrolments, runs, tasks, checkIns, commands] = await Promise.all([
    organizationId
      ? hub.get<PendingEnrolment[]>(`/organizations/${organizationId}/enrolments`)
      : Promise.resolve({ ok: false as const, error: { status: 0, message: "" } }),
    hub.get<RunView[]>(`/workspaces/${workspaceId}/runs?limit=50`),
    hub.get<TaskView[]>(`/workspaces/${workspaceId}/tasks?limit=50`),
    hub.get<CheckIn[]>(`/workspaces/${workspaceId}/schedule/check-ins`),
    hub.get<CommandView[]>(`/workspaces/${workspaceId}/runtime/commands?limit=50`),
  ]);

  const queue: Intervention[] = [];

  /**
   * §6.3 — a machine waiting to be paired, with the code it printed on its
   * own console. First in the list because it is the only entry where
   * somebody is physically waiting.
   */
  if (enrolments.ok) {
    for (const pending of enrolments.value) {
      queue.push({
        kind: "enrolment",
        title: `${pending.hostname} is waiting to be paired`,
        detail: pending.expired
          ? "its code has expired — restart the worker for a new one"
          : `declares: ${pending.capabilities.join(", ") || "nothing"}. Approve with the code shown on that machine.`,
        href: null,
        since: pending.requestedAt,
      });
    }
  }

  /** §11 — a run that finished and is waiting for somebody to judge it. */
  if (runs.ok) {
    for (const run of runs.value.filter((entry) => entry.status === "VALIDATING")) {
      const cost = run.attempts.reduce((total, a) => total + (a.cost ?? 0), 0);
      queue.push({
        kind: "validation",
        title: `A run is waiting to be validated`,
        detail: `task ${run.taskId.slice(0, 8)} · ${run.attempts[0]?.provider ?? "?"} · $${cost.toFixed(4)}`,
        href: `/runs/${run.runId}`,
        since: run.startedAt,
      });
    }
  }

  /** §4.22 — a task stopped by something it cannot resolve alone. */
  if (tasks.ok) {
    for (const task of tasks.value.filter((entry) => entry.status === "BLOCKED")) {
      const open = task.blockers?.filter((b) => b.resolvedAt === null) ?? [];
      queue.push({
        kind: "blocked",
        title: task.title,
        detail: open[0]?.description ?? "blocked, with no reason recorded",
        href: `/tasks/${task.taskId}`,
        since: null,
      });
    }
  }

  /**
   * §9.16 — the signal that fires when nothing is wrong. From an empty queue,
   * "up to date" and "abandoned" are indistinguishable (0.3.10).
   */
  if (checkIns.ok) {
    for (const entry of checkIns.value) {
      queue.push({
        kind: "silent",
        title: `${entry.actor.type.toLowerCase()} ${entry.actor.id.slice(0, 8)} has gone quiet`,
        detail: entry.reason,
        href: null,
        since: null,
      });
    }
  }

  /** §17.7 — an order a machine took and never reported on. */
  if (commands.ok) {
    for (const command of commands.value.filter((c) => c.status === "CLAIMED")) {
      queue.push({
        kind: "stuck",
        title: `${command.type} was claimed and never reported`,
        detail: `held by ${command.claimedBy?.slice(0, 8) ?? "nobody"}`,
        href: null,
        since: null,
      });
    }
  }

  // Oldest first: what has waited longest is what is most likely forgotten.
  return queue.sort((left, right) => (left.since ?? "9").localeCompare(right.since ?? "9"));
}
