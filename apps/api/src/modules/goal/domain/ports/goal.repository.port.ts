import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Goal } from "../goal";

export const GOAL_REPOSITORY = Symbol("GOAL_REPOSITORY");

export interface GoalRepository {
  findById(id: UniqueEntityId): Promise<Goal | null>;
  findByIds(ids: string[]): Promise<Goal[]>;
  listByWorkspace(workspaceId: string): Promise<Goal[]>;
  save(goal: Goal): Promise<void>;
}
