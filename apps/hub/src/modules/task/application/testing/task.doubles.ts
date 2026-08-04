import {
  GoalTaskTally,
  ListTasksFilter,
  TaskRepository,
} from "../../domain/ports/task.repository.port";
import { Task } from "../../domain/task";

export class InMemoryTaskRepository implements TaskRepository {
  readonly tasks = new Map<string, Task>();

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id.value, task);
  }

  async findById(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async list(filter: ListTasksFilter): Promise<Task[]> {
    return [...this.tasks.values()].filter((task) => {
      if (task.workspaceId !== filter.workspaceId) return false;
      if (filter.goalId !== undefined && task.goalId !== filter.goalId) return false;
      if (filter.statuses && !filter.statuses.includes(task.status)) return false;
      if (filter.assignee && !task.assignee.equals(filter.assignee)) return false;
      return true;
    });
  }

  async tallyByGoal(goalId: string): Promise<GoalTaskTally> {
    const counted = [...this.tasks.values()].filter(
      (task) => task.goalId === goalId && task.status !== "CANCELLED",
    );
    return {
      total: counted.length,
      completed: counted.filter((task) => task.status === "COMPLETED").length,
    };
  }
}
