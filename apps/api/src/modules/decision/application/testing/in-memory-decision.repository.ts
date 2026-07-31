import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Decision } from "../../domain/decision";
import { DecisionRepository } from "../../domain/ports/decision.repository.port";

export class InMemoryDecisionRepository implements DecisionRepository {
  private readonly decisions = new Map<string, Decision>();

  async save(decision: Decision): Promise<void> {
    this.decisions.set(decision.id.toString(), decision);
  }

  async findById(id: UniqueEntityId): Promise<Decision | null> {
    return this.decisions.get(id.toString()) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<Decision[]> {
    return [...this.decisions.values()].filter((d) => d.workspaceId === workspaceId);
  }
}
