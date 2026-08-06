import { ActorRef } from "../../../identity/domain/actor";

/**
 * §8.8, §8.9 — a merge conflict blocks the task it was found on.
 *
 * Declared by runtime because runtime is where a machine's report arrives,
 * and supplied by task because §8.9 is literally about a task's state: "un
 * conflit non résolu bloque la tâche". A conflict is not a new kind of thing
 * to model — it is a blocker with a cause, and tasks have had blockers all
 * along.
 *
 * This is what finally reports into the merge conditions. `openConflicts` was
 * hard-coded empty with a comment saying it was empty because nothing
 * reported into it; nothing did, because discovering a conflict needs a
 * working copy and only a machine has one.
 */
export interface ConflictReport {
  /** Idempotent: the same run reporting twice blocks the task once. */
  blockOnConflict(input: {
    workspaceId: string;
    taskId: string;
    /** Git's own words. Which files, in whose language, not a summary. */
    detail: string;
    reportedBy: ActorRef;
  }): Promise<void>;
}

export const CONFLICT_REPORT = "runtime/ConflictReport";
