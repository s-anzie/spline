import { api, type Actor } from "./api";
import { collapse } from "./enrolments";
import { routes } from "./routes";

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
  key: string;
  kind: InterventionKind;
  /** What it is, in one line an operator can act on. */
  title: string;
  /** Why it is here. Never a status word on its own. */
  detail: string;
  /** The address of the rest of the story. */
  href: string | null;
  /** Sorts the queue: what has waited longest is most likely forgotten. */
  since: string | null;
  /** Set on entries whose whole resolution fits on this screen. */
  inline?: "approve-machine";
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
      ? api.enrolments.pending(organizationId)
      : Promise.resolve({ ok: false as const, error: { status: 0, message: "" } }),
    api.runs.list(workspaceId, { limit: 50 }),
    api.tasks.list(workspaceId),
    api.schedule.checkIns(workspaceId),
    api.runtime.commands(workspaceId),
  ]);

  const queue: Intervention[] = [];

  /**
   * §6.3 — a machine waiting to be paired. First, because it is the only
   * entry where a person is standing in front of something, waiting.
   */
  if (enrolments.ok) {
    // Collapsed by machine: a worker that restarted before anybody decided
    // filed one request per start, and they are all still pending.
    for (const machine of collapse(enrolments.value)) {
      queue.push({
        key: `enrolment:${machine.hostname}`,
        kind: "enrolment",
        title: `${machine.hostname} is waiting to be paired`,
        detail: machine.expired
          ? "its code has expired — restart the worker on that machine for a new one"
          : `${machine.operatingSystem}/${machine.architecture} · offers ${machine.capabilities.join(", ") || "nothing"}` +
            (machine.requests > 1
              ? ` · asked ${machine.requests} times, so it is restarting — approving it once is enough`
              : ""),
        href: routes.machines,
        since: machine.since,
        ...(machine.expired ? {} : { inline: "approve-machine" as const }),
      });
    }
  }

  /** §11 — a run that finished and is waiting for somebody to judge it. */
  if (runs.ok) {
    for (const run of runs.value.filter((entry) => entry.status === "VALIDATING")) {
      const cost = run.attempts.reduce((total, a) => total + (a.cost ?? 0), 0);
      queue.push({
        key: `run:${run.runId}`,
        kind: "validation",
        title: "A run is waiting to be validated",
        detail: `task ${run.taskId.slice(0, 8)} · ${run.attempts[0]?.provider ?? "?"} · $${cost.toFixed(4)} over ${run.attempts.length} attempt${run.attempts.length === 1 ? "" : "s"}`,
        href: routes.run(run.runId),
        since: run.startedAt,
      });
    }
  }

  /** §4.22 — a task stopped by something it cannot resolve alone. */
  if (tasks.ok) {
    for (const task of tasks.value.filter((entry) => entry.status === "BLOCKED")) {
      const open = task.blockers.filter((blocker) => blocker.resolvedAt === null);
      queue.push({
        key: `task:${task.id}`,
        kind: "blocked",
        title: task.title,
        detail: open[0]?.description ?? "blocked, with no reason recorded",
        href: routes.task(task.id),
        since: open[0]?.reportedAt ?? null,
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
        key: `silent:${entry.actor.type}:${entry.actor.id}`,
        kind: "silent",
        title: `${name(entry.actor)} has gone quiet`,
        detail: entry.reason,
        href: routes.activity,
        since: null,
      });
    }
  }

  /** §17.7 — an order a machine took and never reported on. */
  if (commands.ok) {
    for (const command of commands.value.filter((c) => c.status === "CLAIMED")) {
      queue.push({
        key: `command:${command.id}`,
        kind: "stuck",
        title: `${command.type.toLowerCase().replace(/_/g, " ")} was claimed and never reported`,
        detail: `held by ${command.claimedBy?.slice(0, 8) ?? "nobody"} on machine ${command.workerId.slice(0, 8)}`,
        href: routes.machines,
        since: null,
      });
    }
  }

  // Oldest first: what has waited longest is what is most likely forgotten.
  return queue.sort((left, right) =>
    (left.since ?? "9").localeCompare(right.since ?? "9"),
  );
}

function name(actor: Actor): string {
  return `${actor.type.toLowerCase()} ${actor.id.slice(0, 8)}`;
}
