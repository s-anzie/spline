import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { AgentCredentialRepository } from "../../domain/ports/agent-credential.repository.port";
import { AgentCredential } from "../../domain/agent-credential";

export class InMemoryAgentCredentialRepository implements AgentCredentialRepository {
  private readonly credentials = new Map<string, AgentCredential>();

  async findById(id: UniqueEntityId): Promise<AgentCredential | null> {
    return this.credentials.get(id.toString()) ?? null;
  }

  async findByAgentId(agentId: string): Promise<AgentCredential | null> {
    for (const credential of this.credentials.values()) {
      if (credential.agentId === agentId) {
        return credential;
      }
    }
    return null;
  }

  async save(credential: AgentCredential): Promise<void> {
    this.credentials.set(credential.id.toString(), credential);
  }
}
