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

export interface RunLedger {
  /** §9.12 — a new run, numbered after the ones that already exist. */
  openRun(workspaceId: string, taskId: string): Promise<{ runId: string }>;
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
