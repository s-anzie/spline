/**
 * "A task is never completed without proof" (§4.9, §4.24) is a rule of the
 * task, so the task declares the abstraction and the Validation module
 * supplies it. Nothing in task/ imports validation/.
 *
 * Until the module exists the default binding answers "nothing is missing" —
 * which is exactly what the code did implicitly before, only now it is a
 * visible seam instead of an absent check.
 */
export interface TaskProofPort {
  /**
   * The mandatory validations of this task that do not currently stand as
   * proof: pending, running, failed, or invalidated (§11.8). Empty means the
   * §11.7 condition "all mandatory validations succeed" is met.
   *
   * Returns the list rather than a boolean because §17.8 requires a degraded
   * state to be reported with the concrete resources concerned, never just a
   * count — and a caller told "no" without being told what is missing cannot
   * act on it.
   */
  unsatisfiedMandatory(taskId: string): Promise<{ id: string; type: string }[]>;

  /**
   * §8.9 — the conflicts still open on this task, as blockers.
   *
   * A conflict IS a blocker: §8.9 says an unresolved one blocks the task, and
   * tasks have had blockers since §4.22. Modelling a Conflict beside them
   * would be a second word for one thing, with its own screen and its own way
   * of being forgotten.
   *
   * The list, not a boolean, for the reason above: a merge refused without
   * saying what is in the way is a refusal nobody can act on.
   */
  openConflicts(taskId: string): Promise<{ id: string; type: string }[]>;

  /**
   * §10.9 — submitting *is* asking for proof. Before this, `/submit` moved
   * the task to VALIDATING and recorded nothing: the status was there, the
   * trace was not (task/doc.md §0.4).
   *
   * The caller names the kinds of proof it expects; naming none is legitimate
   * (a human will simply approve) and must not silently invent one.
   */
  requestOnSubmit(input: {
    workspaceId: string;
    taskId: string;
    requestedByType: string;
    requestedById: string;
    types: readonly string[];
  }): Promise<void>;
}
export const TASK_PROOF = "task/TaskProofPort";
