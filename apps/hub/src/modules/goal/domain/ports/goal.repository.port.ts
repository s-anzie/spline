import { GoalStatus } from "../goal";
import { Goal } from "../goal";

export interface ListGoalsFilter {
  workspaceId: string;
  /** `null` selects root goals only; omitted means "no filter". */
  parentGoalId?: string | null;
  statuses?: readonly GoalStatus[];
  /** Absent means one page, never the whole table (kernel pagination). */
  limit?: number;
}

export interface GoalRepository {
  save(goal: Goal): Promise<void>;
  findById(id: string): Promise<Goal | null>;
  list(filter: ListGoalsFilter): Promise<Goal[]>;
  /** Open = not COMPLETED and not CANCELLED — the completion gate (§2.2). */
  hasOpenChildren(goalId: string): Promise<boolean>;
  /**
   * The one goal a workspace has by name rather than by id: the standing
   * place where stated needs land (`EnsureRequestsGoalUseCase`). Looked up by
   * title because the title IS its identity — a slug column would be a second
   * way to say the same thing, and the two would drift the first time
   * somebody renamed it.
   */
  findByTitle(workspaceId: string, title: string): Promise<Goal | null>;
}
export const GOAL_REPOSITORY = "goal/GoalRepository";
