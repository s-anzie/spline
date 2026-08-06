import { ActorRef } from "../../../identity/domain/actor";

/**
 * §6.8 — what dispatching needs from the two modules it cannot import.
 *
 * Declared here and supplied by `task` and `execution`, per the inversion
 * rule this codebase follows everywhere. Runtime knows how to enqueue an
 * order; it never decides what a task's states mean, nor how runs are
 * numbered.
 */

export type TaskBriefing =
  | {
      dispatchable: true;
      title: string;
      description: string | null;
      acceptanceCriteria: readonly string[];
      goalTitle: string | null;
      /** For scoping memory to the goal, not for the prompt. */
      goalId: string | null;
    }
  | { dispatchable: false; reason: string };

export interface DispatchableTask {
  /**
   * Everything the prompt needs, plus whether the task may be dispatched at
   * all. One call rather than two, so the answer cannot be true when read and
   * false when used.
   */
  briefingFor(workspaceId: string, taskId: string): Promise<TaskBriefing>;
}

export const DISPATCHABLE_TASK = "runtime/DispatchableTask";

export interface LatestRun {
  runId: string;
  provider: string | null;
  /** §4.8 — what a resume would resume. Null when the run recorded none. */
  providerSessionId: string | null;
}

export interface RecordOutcomeInput {
  workspaceId: string;
  /** Null when the order carried no run — an order enqueued by hand. */
  runId: string | null;
  outcome: "COMPLETED" | "FAILED";
  result: Record<string, unknown>;
  failureReason: string | null;
}

export interface BeginAttemptOnRunInput {
  workspaceId: string;
  runId: string | null;
  workerId: string;
  provider: string;
  model: string | null;
}

export interface RunLedger {
  /** §9.12 — a new run, numbered after the ones that already exist. */
  openRun(workspaceId: string, taskId: string): Promise<{ runId: string }>;
  /**
   * §4.7 — the run starts when a machine TAKES the order, not when it
   * reports. A run that stayed PENDING while a machine was executing it would
   * be lying for the whole duration — and §9.13's overrun sweep judges
   * against `startedAt`, which only an open attempt sets.
   */
  beginAttempt(input: BeginAttemptOnRunInput): Promise<void>;
  /** The last run of this task, whatever became of it. */
  latestFor(workspaceId: string, taskId: string): Promise<LatestRun | null>;
  /**
   * §4.8 — closes the attempt with what the worker reported, including the
   * provider session it left behind. Best-effort: an order that finished is
   * finished, and bookkeeping must not un-finish it.
   */
  recordOutcome(input: RecordOutcomeInput): Promise<void>;
}

export const RUN_LEDGER = "runtime/RunLedger";

/**
 * §18.10 — whose authority an order borrows. Read from the TASK, never named
 * by the machine: a worker that could choose would be able to borrow anyone's.
 */
export interface TaskAssignee {
  assigneeOf(workspaceId: string, taskId: string): Promise<ActorRef | null>;
}

export const TASK_ASSIGNEE = "runtime/TaskAssignee";

/**
 * §4.6 — whether the actor a task is assigned to organises work or does it.
 *
 * Declared here rather than read from the permission matrix directly: runtime
 * dispatches, it does not own what a role means. The answer decides which
 * briefing goes out, and getting it from the same source that decides which
 * TOOLS go out is what keeps the two from disagreeing — an agent told to call
 * `cut_task` without holding `manage_tasks` would be told about a tool it was
 * never given.
 */
export interface OrganisingActor {
  organises(actor: ActorRef, workspaceId: string): Promise<boolean>;
}

export const ORGANISING_ACTOR = "runtime/OrganisingActor";
