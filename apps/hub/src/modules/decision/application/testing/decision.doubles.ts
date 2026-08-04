import { Decision } from "../../domain/decision";
import {
  DecisionRepository,
  ListDecisionsFilter,
} from "../../domain/ports/decision.repository.port";

export class InMemoryDecisionRepository implements DecisionRepository {
  readonly decisions = new Map<string, Decision>();

  async save(decision: Decision): Promise<void> {
    this.decisions.set(decision.id.value, decision);
  }

  async findById(id: string): Promise<Decision | null> {
    return this.decisions.get(id) ?? null;
  }

  async list(filter: ListDecisionsFilter): Promise<Decision[]> {
    return [...this.decisions.values()].filter((decision) => {
      if (decision.workspaceId !== filter.workspaceId) return false;
      if (filter.taskId !== undefined && decision.taskId !== filter.taskId) return false;
      if (filter.author && !decision.author.equals(filter.author)) return false;
      if (filter.confidences && !filter.confidences.includes(decision.confidence)) {
        return false;
      }
      if (!filter.includeSuperseded && decision.isSuperseded) return false;
      return true;
    });
  }
}
