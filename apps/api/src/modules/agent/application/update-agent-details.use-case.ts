import { Inject, Injectable, Optional } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Agent } from "../domain/agent";
import { EmptyAgentDisplayNameError, EmptyAgentProviderError } from "../domain/agent.errors";
import { AGENT_REPOSITORY, AgentRepository } from "../domain/ports/agent.repository.port";
import { PROVIDER_PROFILE_REPOSITORY, ProviderProfileRepository } from "../domain/ports/provider-profile.repository.port";
import { AgentNotFoundError, AgentProviderUnavailableError } from "./agent-application.errors";

export interface UpdateAgentDetailsInput {
  agentId: string;
  provider?: string;
  displayName?: string;
  capabilities?: string[];
  promptProfile?: Record<string, unknown>;
  permissions?: string[];
}

export type UpdateAgentDetailsError = AgentNotFoundError | EmptyAgentDisplayNameError | EmptyAgentProviderError | AgentProviderUnavailableError;

@Injectable()
export class UpdateAgentDetailsUseCase {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Optional()
    @Inject(PROVIDER_PROFILE_REPOSITORY)
    private readonly providerProfiles?: ProviderProfileRepository,
  ) {}

  async execute(input: UpdateAgentDetailsInput): Promise<Result<Agent, UpdateAgentDetailsError>> {
    const agent = await this.agents.findById(UniqueEntityId.create(input.agentId));
    if (!agent) {
      return Result.fail(new AgentNotFoundError(input.agentId));
    }
    if (input.provider && input.provider !== agent.provider) {
      const profile = await this.providerProfiles?.findByProvider(input.provider);
      if (profile?.available === false)
        return Result.fail(new AgentProviderUnavailableError(input.provider));
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
