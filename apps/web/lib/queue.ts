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
  /**
   * False when the entry is worth SEEING but cannot be acted on — an
   * enrolment whose code expired, for instance. Shown, never counted: §17.8
   * forbids hiding it, and counting it sends somebody hunting for an action
   * that does not exist.
   */
  actionable: boolean;
  /** Set on entries whose whole resolution fits on this screen. */
  inline?: "approve-machine" | "settle-validation";
  /** §11 — which piece of proof the verdict is about. */
  validationId?: string;
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
  const [enrolments, tasks, checkIns, commands, proof] = await Promise.all([
    organizationId
      ? api.enrolments.pending(organizationId)
      : Promise.resolve({ ok: false as const, error: { status: 0, message: "" } }),
    // Runs are no longer read here: the queue asks about PROOF, which is the
    // thing a person can actually pronounce on. A run at VALIDATING is the
    // consequence of proof outstanding, not a separate thing to act on.
    api.tasks.list(workspaceId),
    api.schedule.checkIns(workspaceId),
    api.runtime.commands(workspaceId),
    api.validations.list(workspaceId),
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
        href: routes.fleet,
        since: machine.since,
        actionable: !machine.expired,
        ...(machine.expired ? {} : { inline: "approve-machine" as const }),
      });
    }
  }

  /**
   * §11 — proof somebody asked for, and only somebody else can give.
   *
   * The PROOF, not the run. This listed runs sitting at VALIDATING and sent
   * the reader to the run screen, where there was nothing to press: an agent
   * asking for validation — exactly what §10.9 requires of it — produced a
   * line telling you to act and no way anywhere to act. The verdict is a
   * decision about a validation, so that is what the queue offers, and it
   * offers it here rather than three screens away.
   */
  if (proof.ok) {
    const titleOf = (taskId: string) =>
      tasks.ok
        ? tasks.value.find((task) => task.id === taskId)?.title
        : undefined;
    for (const validation of proof.value.filter(
      (entry) => entry.status === "PENDING" || entry.status === "RUNNING",
    )) {
      queue.push({
        key: `validation:${validation.id}`,
        kind: "validation",
        title: titleOf(validation.taskId) ?? `task ${validation.taskId.slice(0, 8)}`,
        detail: `waiting on ${humanKind(validation.type)}${validation.mandatory ? "" : " (optional)"} — asked for by ${validation.requestedBy.type.toLowerCase()} ${validation.requestedBy.id.slice(0, 8)}`,
        href: routes.task(validation.taskId),
        since: validation.createdAt,
        actionable: true,
        inline: "settle-validation",
        validationId: validation.id,
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
        actionable: true,
      });
    }
  }

  /**
   * §9.16 — the signal that fires when nothing is wrong. From an empty queue,
   * "up to date" and "abandoned" are indistinguishable (0.3.10).
   */
  if (checkIns.ok) {
    for (const entry of checkIns.value) {
      // Never assigned anything is not the same as fell silent. The hub
      // reports both through one signal, correctly — §9.16 fires when nothing
      // is wrong — but calling a colleague who joined this morning "quiet"
      // is how a queue teaches people to stop reading it.
      const neverGiven = entry.silentForMs === null;
      queue.push({
        key: `silent:${entry.actor.type}:${entry.actor.id}`,
        kind: "silent",
        title: neverGiven
          ? `${name(entry.actor)} has never been given anything`
          : `${name(entry.actor)} has gone quiet`,
        detail: entry.reason,
        href: routes.activity,
        since: null,
        actionable: !neverGiven,
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
        href: routes.fleet,
        since: null,
        actionable: true,
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

/** `unit_test` is how the domain writes it; "a unit test" is how it reads. */
function humanKind(type: string): string {
  return type.replace(/_/g, " ");
}
