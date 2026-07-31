import { Inject, Injectable } from "@nestjs/common";

import { Agent } from "../domain/agent";
import { AGENT_REPOSITORY, AgentRepository } from "../domain/ports/agent.repository.port";

@Injectable()
export class ListAgentsByWorkspaceUseCase {
  constructor(@Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository) {}

  async execute(workspaceId: string): Promise<Agent[]> {
    return this.agents.listByWorkspace(workspaceId);
  }
}
