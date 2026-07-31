import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { AgentCredential } from "../agent-credential";

export const AGENT_CREDENTIAL_REPOSITORY = Symbol("AGENT_CREDENTIAL_REPOSITORY");

export interface AgentCredentialRepository {
  findById(id: UniqueEntityId): Promise<AgentCredential | null>;
  findByAgentId(agentId: string): Promise<AgentCredential | null>;
  save(credential: AgentCredential): Promise<void>;
}
