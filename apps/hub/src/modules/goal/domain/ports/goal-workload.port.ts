/**
 * The rules "a goal is not complete while its tasks are open" and "progress is
 * the share of settled work" belong to the goal (§5.6 puts both under the Goal
 * Engine), so the goal declares the abstraction and whichever module owns work
 * supplies the facts. Dependency inversion keeps goal → task out of the import
 * graph.
 */
export interface GoalWorkloadTally {
  /** Work that counts toward the goal — cancelled items are excluded. */
  total: number;
  completed: number;
}

export interface GoalWorkloadPort {
  hasOpenTasks(goalId: string): Promise<boolean>;
  tally(goalId: string): Promise<GoalWorkloadTally>;
}
export const GOAL_WORKLOAD = "goal/GoalWorkloadPort";
