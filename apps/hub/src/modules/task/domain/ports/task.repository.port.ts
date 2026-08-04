import { ActorRef } from "../../../identity/domain/actor";
import { Task, TaskStatus } from "../task";

export interface ListTasksFilter {
  workspaceId: string;
  goalId?: string;
  statuses?: readonly TaskStatus[];
  assignee?: ActorRef;
}

export interface GoalTaskTally {
  /** Tasks that count toward the goal — cancelled ones are excluded. */
  total: number;
  completed: number;
}

export interface TaskRepository {
  save(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  list(filter: ListTasksFilter): Promise<Task[]>;
  /** Feeds goal progress (§2.4) without loading every task. */
  tallyByGoal(goalId: string): Promise<GoalTaskTally>;
}
export const TASK_REPOSITORY = "task/TaskRepository";
