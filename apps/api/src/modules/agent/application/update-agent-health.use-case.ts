import { AgentHealthState } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Agent } from "../domain/agent";
import { AGENT_REPOSITORY, AgentRepository } from "../domain/ports/agent.repository.port";
import { AgentNotFoundError } from "./agent-application.errors";

export interface UpdateAgentHealthInput {
  agentId: string;
  healthState: AgentHealthState;
}

@Injectable()
export class UpdateAgentHealthUseCase {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: UpdateAgentHealthInput): Promise<Result<Agent, AgentNotFoundError>> {
    const agent = await this.agents.findById(UniqueEntityId.create(input.agentId));
    if (!agent) {
      return Result.fail(new AgentNotFoundError(input.agentId));
    }

    agent.updateHealth(input.healthState);
    await this.agents.save(agent);
    this.eventPublisher.publishAll(agent.domainEvents);
    agent.clearEvents();

    return Result.ok(agent);
  }
}
