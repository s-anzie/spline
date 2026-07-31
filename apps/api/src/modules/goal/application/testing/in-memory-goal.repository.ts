import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { GoalRepository } from "../../domain/ports/goal.repository.port";
import { Goal } from "../../domain/goal";

export class InMemoryGoalRepository implements GoalRepository {
  private readonly goals = new Map<string, Goal>();

  async findById(id: UniqueEntityId): Promise<Goal | null> {
    return this.goals.get(id.toString()) ?? null;
  }

  async findByIds(ids: string[]): Promise<Goal[]> {
    const idSet = new Set(ids);
    return [...this.goals.values()].filter((g) => idSet.has(g.id.toString()));
  }

  async listByWorkspace(workspaceId: string): Promise<Goal[]> {
    return [...this.goals.values()].filter((g) => g.workspaceId === workspaceId);
  }

  async save(goal: Goal): Promise<void> {
    this.goals.set(goal.id.toString(), goal);
  }
}
