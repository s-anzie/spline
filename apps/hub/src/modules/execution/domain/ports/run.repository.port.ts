import { Run, RunStatus } from "../run";

export interface ListRunsFilter {
  workspaceId: string;
  taskId?: string;
  status?: RunStatus;
  limit?: number;
}

export interface RunRepository {
  save(run: Run): Promise<void>;
  findById(id: string): Promise<Run | null>;
  list(filter: ListRunsFilter): Promise<Run[]>;
  /**
   * §9.12 — a retry is the NEXT run of a task, so the number comes from what
   * is already there. Counted in the database rather than by loading the
   * history: the history is kept for reading, not for arithmetic.
   */
  countForTask(taskId: string): Promise<number>;
  /**
   * §9.13 — runs that are still executing. What "too long" means is judged at
   * read by the caller (§17.7), never stored as a deadline that would go
   * stale the moment a policy changes.
   */
  listLive(workspaceId: string, limit?: number): Promise<Run[]>;
  /**
   * §9 — the two numbers the automatic ceiling is judged against, counted in
   * the database. `listLive(...).length` would answer the first, and would
   * load every live run to do arithmetic on it.
   */
  countLive(workspaceId: string): Promise<number>;
  countSince(workspaceId: string, since: Date): Promise<number>;
}

export const RUN_REPOSITORY = "execution/RunRepository";

/**
 * What this module needs from a task, and nothing more.
 *
 * Declared HERE and supplied by the task module, per the inversion rule this
 * codebase follows everywhere: the consumer declares the port, the provider
 * supplies the adapter. Execution never imports the task module, so the two
 * can be read — and changed — independently.
 */
export interface RetryableTask {
  /** Refuses unless the task is in a state a retry can legitimately follow. */
  reopenForRetry(taskId: string, workspaceId: string): Promise<RetryOutcome>;
}

export type RetryOutcome =
  | { retryable: true; goalId: string }
  | { retryable: false; reason: string };

export const RETRYABLE_TASK = "execution/RetryableTask";
