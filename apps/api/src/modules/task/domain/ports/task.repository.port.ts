import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Task } from "../task";

export const TASK_REPOSITORY = Symbol("TASK_REPOSITORY");

export interface TaskRepository {
  findById(id: UniqueEntityId): Promise<Task | null>;
  findByIds(ids: string[]): Promise<Task[]>;
  listByWorkspace(workspaceId: string, goalId?: string): Promise<Task[]>;
  listByGoal(goalId: string): Promise<Task[]>;
  save(task: Task): Promise<void>;
}
