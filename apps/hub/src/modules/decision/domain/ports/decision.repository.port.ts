import { ActorRef } from "../../../identity/domain/actor";
import { Decision, DecisionConfidence } from "../decision";

export interface ListDecisionsFilter {
  workspaceId: string;
  taskId?: string;
  author?: ActorRef;
  confidences?: readonly DecisionConfidence[];
  /** Superseded reasoning is history: it is asked for, never returned by default. */
  includeSuperseded?: boolean;
}

export interface DecisionRepository {
  save(decision: Decision): Promise<void>;
  findById(id: string): Promise<Decision | null>;
  list(filter: ListDecisionsFilter): Promise<Decision[]>;
}
export const DECISION_REPOSITORY = "decision/DecisionRepository";
