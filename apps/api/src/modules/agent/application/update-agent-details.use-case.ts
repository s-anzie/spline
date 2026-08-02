import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Agent } from "../domain/agent";
import { EmptyAgentDisplayNameError, EmptyAgentProviderError } from "../domain/agent.errors";
import { AGENT_REPOSITORY, AgentRepository } from "../domain/ports/agent.repository.port";
import { AgentNotFoundError } from "./agent-application.errors";

export interface UpdateAgentDetailsInput {
  agentId: string;
  provider?: string;
  displayName?: string;
  capabilities?: string[];
  promptProfile?: Record<string, unknown>;
  permissions?: string[];
}

export type UpdateAgentDetailsError = AgentNotFoundError | EmptyAgentDisplayNameError | EmptyAgentProviderError;

@Injectable()
export class UpdateAgentDetailsUseCase {
  constructor(@Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository) {}

  async execute(input: UpdateAgentDetailsInput): Promise<Result<Agent, UpdateAgentDetailsError>> {
    const agent = await this.agents.findById(UniqueEntityId.create(input.agentId));
    if (!agent) {
      return Result.fail(new AgentNotFoundError(input.agentId));
    }

    try {
      agent.updateDetails(input);
    } catch (error) {
      if (error instanceof EmptyAgentDisplayNameError || error instanceof EmptyAgentProviderError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.agents.save(agent);

    return Result.ok(agent);
  }
}
