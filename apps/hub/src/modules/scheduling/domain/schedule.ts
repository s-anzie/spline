import { DependencyGraph } from "../../../kernel/domain/dependency-graph";
import { comparePriority, Priority } from "../../../kernel/domain/priority";
import { ActorRef } from "../../identity/domain/actor";
import { TaskStatus } from "../../task/domain/task";

export interface SchedulableTask {
  id: string;
  goalId: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dependsOn: readonly string[];
  assignee: ActorRef | null;
  createdAt: Date;
}

export interface ReadyEntry {
  id: string;
  goalId: string;
  title: string;
  priority: Priority;
  /** How many tasks this one releases — counted, never estimated. */
  unblocks: number;
  assignee: { type: string; id: string } | null;
  createdAt: Date;
}

export interface WaitingEntry {
  id: string;
  title: string;
  /** §17.8 — not "not ready", but held by what, named. */
  blockedBy: { id: string; reason: string }[];
}

export interface ScheduleSummary {
  readyCount: number;
  waitingCount: number;
  /** Already under way: running, validating, or awaiting a verdict. */
  inFlightCount: number;
  /**
   * §9.16 — the distinction that stops a system going quiet: nothing to do
   * because everything is done is not the same as nothing to do because
   * everything is stuck, and an empty list looks identical either way.
   */
  nothingToDo: boolean;
}

export interface Schedule {
  ready: ReadyEntry[];
  waiting: WaitingEntry[];
  cycles: string[][];
  summary: ScheduleSummary;
}

/** Work that is finished, abandoned, or already someone's problem. */
const SETTLED: readonly TaskStatus[] = ["COMPLETED", "CANCELLED", "FAILED"];
const IN_FLIGHT: readonly TaskStatus[] = ["RUNNING", "VALIDATING"];

/**
 * §9 — "il ne réalise jamais le travail : il décide où et quand". This is the
 * "quand".
 *
 * The "où" needed Workers, and they now exist (runtime module). What is still
 * missing is smaller and nameable: matching a task's constraints (§9.8) to a
 * worker's declared capabilities (§9.9), and a command queue to hand the
 * assignment to. The queue below is already ordered, so assigning becomes
 * "take the head that fits" — this comment says so rather than repeating that
 * Workers do not exist, which stopped being true.
 *
 * A pure function, and nothing is stored: a schedule is a CONCLUSION, valid
 * only for the state it was computed from. Persisting it would create a
 * second truth that ages — the mistake the memory module refuses by
 * construction.
 */
export function scheduleOf(tasks: readonly SchedulableTask[], now: Date): Schedule {
  void now;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const completed = new Set(
    tasks.filter((task) => task.status === "COMPLETED").map((task) => task.id),
  );

  const graph = new DependencyGraph();
  const cycles: string[][] = [];
  for (const task of tasks) {
    graph.addNode(task.id);
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      // The graph refuses a cycle at insertion (§9.5); refusing it is how we
      // learn about it, rather than by looping while walking it.
      const added = graph.addDependency(task.id, dependency);
      if (added.isFailure) {
        cycles.push([task.id, dependency]);
      }
    }
  }
  const inACycle = new Set(cycles.flat());

  const ready: ReadyEntry[] = [];
  const waiting: WaitingEntry[] = [];
  let inFlightCount = 0;

  for (const task of tasks) {
    if (SETTLED.includes(task.status)) {
      continue;
    }
    if (IN_FLIGHT.includes(task.status)) {
      inFlightCount++;
      continue;
    }

    const blockedBy = blockersOf(task, byId, completed, inACycle);
    if (blockedBy.length > 0) {
      waiting.push({ id: task.id, title: task.title, blockedBy });
      continue;
    }
    ready.push({
      id: task.id,
      goalId: task.goalId,
      title: task.title,
      priority: task.priority,
      unblocks: graph.dependentsOf(task.id).length,
      assignee: task.assignee
        ? { type: task.assignee.type, id: task.assignee.actorId }
        : null,
      createdAt: task.createdAt,
    });
  }

  ready.sort(byPrecedence);

  return {
    ready,
    waiting,
    cycles,
    summary: {
      readyCount: ready.length,
      waitingCount: waiting.length,
      inFlightCount,
      nothingToDo:
        ready.length === 0 && waiting.length === 0 && inFlightCount === 0,
    },
  };
}

function blockersOf(
  task: SchedulableTask,
  byId: ReadonlyMap<string, SchedulableTask>,
  completed: ReadonlySet<string>,
  inACycle: ReadonlySet<string>,
): { id: string; reason: string }[] {
  if (inACycle.has(task.id)) {
    return [{ id: task.id, reason: "circular dependency" }];
  }
  // §4.22 — a blocked task does not progress. Saying so beats omitting it,
  // which would read as "there is nothing else to do".
  if (task.status === "BLOCKED") {
    return [{ id: task.id, reason: "an unresolved blocker" }];
  }

  const blockers: { id: string; reason: string }[] = [];
  for (const dependency of task.dependsOn) {
    if (!byId.has(dependency)) {
      // A dependency on something that is not there never completes: holding
      // the task is the safe reading, and naming it is how anyone finds out.
      blockers.push({ id: dependency, reason: "dependency not found" });
    } else if (!completed.has(dependency)) {
      blockers.push({ id: dependency, reason: "dependency not completed" });
    }
  }
  return blockers;
}

/**
 * §10.18d — tiers compared one after another, never weights summed.
 *
 * The property this buys: a BACKGROUND task that would release twenty others
 * still never overtakes a CRITICAL one, because tier 2 is only ever reached
 * when tier 1 ties. A weighted score cannot promise that, and nobody can
 * predict its output by reading it.
 */
function byPrecedence(a: ReadyEntry, b: ReadyEntry): number {
  const priority = comparePriority(a.priority, b.priority);
  if (priority !== 0) {
    return priority;
  }
  if (a.unblocks !== b.unblocks) {
    return b.unblocks - a.unblocks;
  }
  const age = a.createdAt.getTime() - b.createdAt.getTime();
  if (age !== 0) {
    return age;
  }
  // Total determinism: two runs over the same tasks give the same order,
  // whatever order they were loaded in.
  return a.id.localeCompare(b.id);
}
