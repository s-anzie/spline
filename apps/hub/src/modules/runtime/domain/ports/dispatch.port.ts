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
      /**
       * §8.3 — the repository this task works in, if it works in one.
       *
       * Null is the ordinary case and not a defect: plenty of work touches no
       * code. When it is set, the machine checks the repository out on a
       * branch of this task's own rather than dropping the agent into a bare
       * directory — which is what it did for every task before this existed.
       */
      repository: {
        id: string;
        /**
         * §8.3 — how a machine finds it locally.
         *
         * The hub says WHICH repository; the machine says where its projects
         * live. A path stored here would be one path for every machine, and
         * the same repository sits at `/home/ada/projects/app` on one and
         * `/srv/app` on another. The name is the only part both agree on.
         */
        name: string;
        origin: string;
        /** Where it lives on disk, when an operator said. */
        localPath: string | null;
        baseBranch: string;
        protectedBranches: readonly string[];
      } | null;
    }
  | { dispatchable: false; reason: string };

export interface DispatchableTask {
  /**
   * Everything the prompt needs, plus whether the task may be dispatched at
   * all. One call rather than two, so the answer cannot be true when read and
   * false when used.
   */
  briefingFor(workspaceId: string, taskId: string): Promise<TaskBriefing>;

  /**
   * §9 — the tasks in this workspace waiting to be run, oldest first.
   *
   * Dispatch used to happen only on `task.created` and `task.assigned`, so
   * every reason it could decline — no provider in the catalogue, the
   * ceiling already reached, no machine attached at that instant — stranded
   * the task for good. Every one of those conditions is TEMPORARY and the
   * stall was permanent, which is how a workspace with automation on, a
   * machine online and a task READY sat at zero commands.
   *
   * Oldest first, because what has waited longest is what has been forgotten
   * (§10.1).
   */
  awaitingDispatch(workspaceId: string, limit: number): Promise<string[]>;
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
   * §9 — what the automatic ceiling is judged against.
   *
   * Two counts rather than one because they answer different questions:
   * how much is happening at once (a machine and a wallet can only take so
   * much in parallel) and how much has happened lately (what stops a night
   * from being spent). Counted in the database — the run history is kept for
   * reading, not for arithmetic.
   */
  countLive(workspaceId: string): Promise<number>;
  /**
   * §9 — the tasks that already have a run in flight.
   *
   * Needed because dispatching does NOT move a task out of READY: the task
   * stays ready while its run works, so anything that looks for ready tasks
   * and dispatches them would start a second run on work already under way —
   * and, on a trigger that repeats, a third and a fourth. A repeated sweep
   * without this is a runaway, which is a far worse failure than the stall it
   * was written to fix.
   */
  liveTaskIds(workspaceId: string, taskIds: readonly string[]): Promise<string[]>;
  countSince(workspaceId: string, since: Date): Promise<number>;
  /**
   * §9.13 — ends the runs whose machine stopped talking, and answers how many.
   *
   * Called before the ceiling is measured rather than on a timer, which is
   * the whole reason it belongs here: a dead run holds a slot, and the moment
   * that matters is the moment somebody asks whether there is room. A sweep
   * that ran every ten minutes would leave a workspace stalled for ten
   * minutes; this one has already run by the time the question is asked.
   */
  abandonSilent(workspaceId: string): Promise<number>;
  /** §4.8 — how many times this task has already been run, whatever became of them. */
  countForTask(taskId: string): Promise<number>;
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

/**
 * §9 — how much this workspace may do without anybody clicking.
 *
 * Declared here and supplied by `workspace`, which owns the settings the
 * numbers live in. Runtime dispatches; it does not decide what a workspace
 * allows.
 */
export interface AutomationPolicy {
  limitsFor(workspaceId: string): Promise<{
    automatic: boolean;
    concurrentRuns: number;
    runsPerDay: number;
    /** §4.12 — how many instances of ONE agent may be live here at once. */
    sessionsPerAgent: number;
  }>;
}

export const AUTOMATION_POLICY = "runtime/AutomationPolicy";
