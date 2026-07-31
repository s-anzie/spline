import { AgentStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Agent } from "../domain/agent";
import { AGENT_REPOSITORY, AgentRepository } from "../domain/ports/agent.repository.port";
import { AgentNotFoundError } from "./agent-application.errors";

export interface UpdateAgentPresenceInput {
  agentId: string;
  connected: boolean;
}

/** Already "present" — a connect signal shouldn't downgrade active work back to plain ONLINE. */
const ALREADY_CONNECTED_STATUSES: AgentStatus[] = [AgentStatus.ONLINE, AgentStatus.BUSY];

/**
 * Driven by RealtimeGateway on every WS connect/disconnect for an AGENT
 * requester — including flaky reconnects — so this must be idempotent: it
 * only calls Agent.changeStatus when presence actually changes, rather than
 * letting the strict status transition table throw on a same-status retry.
 */
@Injectable()
export class UpdateAgentPresenceUseCase {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: UpdateAgentPresenceInput): Promise<Result<Agent, AgentNotFoundError>> {
    const agent = await this.agents.findById(UniqueEntityId.create(input.agentId));
    if (!agent) {
      return Result.fail(new AgentNotFoundError(input.agentId));
    }

    if (input.connected) {
      if (!ALREADY_CONNECTED_STATUSES.includes(agent.status)) {
        agent.changeStatus(AgentStatus.ONLINE);
      }
    } else if (agent.status !== AgentStatus.OFFLINE) {
      agent.changeStatus(AgentStatus.OFFLINE);
    }

    await this.agents.save(agent);
    this.eventPublisher.publishAll(agent.domainEvents);
    agent.clearEvents();

    return Result.ok(agent);
  }
}
