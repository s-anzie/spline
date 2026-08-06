import { Goal } from "../../domain/goal";
import {
  GoalRepository,
  ListGoalsFilter,
} from "../../domain/ports/goal.repository.port";

export class InMemoryGoalRepository implements GoalRepository {
  readonly goals = new Map<string, Goal>();

  async save(goal: Goal): Promise<void> {
    this.goals.set(goal.id.value, goal);
  }

  async findById(id: string): Promise<Goal | null> {
    return this.goals.get(id) ?? null;
  }

  async list(filter: ListGoalsFilter): Promise<Goal[]> {
    return [...this.goals.values()].filter((goal) => {
      if (goal.workspaceId !== filter.workspaceId) return false;
      if (filter.parentGoalId !== undefined && goal.parentGoalId !== filter.parentGoalId) {
        return false;
      }
      if (filter.statuses && !filter.statuses.includes(goal.status)) return false;
      return true;
    });
  }

  async findByTitle(workspaceId: string, title: string): Promise<Goal | null> {
    return (
      [...this.goals.values()].find(
        (goal) => goal.workspaceId === workspaceId && goal.title === title,
      ) ?? null
    );
  }

  async hasOpenChildren(goalId: string): Promise<boolean> {
    return [...this.goals.values()].some(
      (goal) =>
        goal.parentGoalId === goalId &&
        goal.status !== "COMPLETED" &&
        goal.status !== "CANCELLED",
    );
  }

}
