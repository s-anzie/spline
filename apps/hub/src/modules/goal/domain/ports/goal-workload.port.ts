/**
 * The rule "a goal is not complete while its tasks are still open" belongs to
 * the goal, so the goal declares the abstraction and the task module supplies
 * it. Dependency inversion keeps goal → task out of the import graph.
 */
export interface GoalWorkloadPort {
  hasOpenTasks(goalId: string): Promise<boolean>;
}
export const GOAL_WORKLOAD = "goal/GoalWorkloadPort";
