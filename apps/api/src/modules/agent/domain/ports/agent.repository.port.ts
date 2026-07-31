import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Agent } from "../agent";

export const AGENT_REPOSITORY = Symbol("AGENT_REPOSITORY");

export interface AgentRepository {
  findById(id: UniqueEntityId): Promise<Agent | null>;
  listByWorkspace(workspaceId: string): Promise<Agent[]>;
  save(agent: Agent): Promise<void>;
}
