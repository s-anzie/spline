import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Agent } from "../domain/agent";
import { AGENT_REPOSITORY, AgentRepository } from "../domain/ports/agent.repository.port";
import { AgentNotFoundError } from "./agent-application.errors";

@Injectable()
export class GetAgentUseCase {
  constructor(@Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository) {}

  async execute(agentId: string): Promise<Result<Agent, AgentNotFoundError>> {
    const agent = await this.agents.findById(UniqueEntityId.create(agentId));
    if (!agent) {
      return Result.fail(new AgentNotFoundError(agentId));
    }
    return Result.ok(agent);
  }
}
