import { GoalStatus } from "../goal";
import { Goal } from "../goal";

export interface ListGoalsFilter {
  workspaceId: string;
  /** `null` selects root goals only; omitted means "no filter". */
  parentGoalId?: string | null;
  statuses?: readonly GoalStatus[];
}

export interface GoalRepository {
  save(goal: Goal): Promise<void>;
  findById(id: string): Promise<Goal | null>;
  list(filter: ListGoalsFilter): Promise<Goal[]>;
  /** Open = not COMPLETED and not CANCELLED — the completion gate (§2.2). */
  hasOpenChildren(goalId: string): Promise<boolean>;
}
export const GOAL_REPOSITORY = "goal/GoalRepository";
