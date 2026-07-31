import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { TaskRepository } from "../../domain/ports/task.repository.port";
import { Task } from "../../domain/task";

export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();

  async findById(id: UniqueEntityId): Promise<Task | null> {
    return this.tasks.get(id.toString()) ?? null;
  }

  async findByIds(ids: string[]): Promise<Task[]> {
    const idSet = new Set(ids);
    return [...this.tasks.values()].filter((t) => idSet.has(t.id.toString()));
  }

  async listByWorkspace(workspaceId: string, goalId?: string): Promise<Task[]> {
    return [...this.tasks.values()].filter(
      (t) => t.workspaceId === workspaceId && (goalId === undefined || t.goalId === goalId),
    );
  }

  async listByGoal(goalId: string): Promise<Task[]> {
    return [...this.tasks.values()].filter((t) => t.goalId === goalId);
  }

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id.toString(), task);
  }
}
