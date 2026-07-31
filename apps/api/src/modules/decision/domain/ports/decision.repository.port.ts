import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Decision } from "../decision";

export const DECISION_REPOSITORY = Symbol("DECISION_REPOSITORY");

export interface DecisionRepository {
  save(decision: Decision): Promise<void>;
  findById(id: UniqueEntityId): Promise<Decision | null>;
  listByWorkspace(workspaceId: string): Promise<Decision[]>;
}
