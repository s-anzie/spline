import { Priority } from "../../../../kernel/domain/priority";

/**
 * §9.14 — the three questions preemption has to ask, each answered by the
 * module that owns the answer.
 *
 * Declared HERE and supplied elsewhere, per the inversion rule this codebase
 * applies everywhere. Scheduling decides WHICH task may be interrupted; it
 * never decides what a task's states mean, whether a run can be resumed, or
 * when a lease may be reclaimed.
 */

export interface RunningTask {
  taskId: string;
  priority: Priority;
}

export interface PreemptableTasks {
  /** Tasks currently executing in this workspace. */
  listRunning(workspaceId: string): Promise<RunningTask[]>;
  /**
   * Puts a task back where it can be picked up again. Blocking rather than
   * failing on purpose: a task carries where it stood when it got blocked, so
   * it resumes instead of restarting (§4.6).
   */
  interrupt(workspaceId: string, taskId: string, reason: string): Promise<boolean>;
}
export const PREEMPTABLE_TASKS = "scheduling/PreemptableTasks";

export interface ActiveRun {
  runId: string;
  startedAt: Date;
  /** §4.8 (0.3.11) — whether the last attempt could be picked up again. */
  resumable: boolean;
}

export interface ActiveRuns {
  activeRunFor(workspaceId: string, taskId: string): Promise<ActiveRun | null>;
  /** Closes the run so its attempt is not left counting as still in flight. */
  abandon(workspaceId: string, runId: string, reason: string): Promise<void>;
}
export const ACTIVE_RUNS = "scheduling/ActiveRuns";

export interface ReclaimableLeases {
  /** §9.14 — "si le Lease est récupérable". */
  isReclaimable(workspaceId: string, taskId: string): Promise<boolean>;
  reclaim(workspaceId: string, taskId: string, reason: string): Promise<void>;
}
export const RECLAIMABLE_LEASES = "scheduling/ReclaimableLeases";
