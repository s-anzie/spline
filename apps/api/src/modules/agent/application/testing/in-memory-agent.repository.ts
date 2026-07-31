import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { AgentRepository } from "../../domain/ports/agent.repository.port";
import { Agent } from "../../domain/agent";

export class InMemoryAgentRepository implements AgentRepository {
  private readonly agents = new Map<string, Agent>();

  async findById(id: UniqueEntityId): Promise<Agent | null> {
    return this.agents.get(id.toString()) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<Agent[]> {
    return [...this.agents.values()].filter((a) => a.workspaceId === workspaceId);
  }

  async save(agent: Agent): Promise<void> {
    this.agents.set(agent.id.toString(), agent);
  }
}
