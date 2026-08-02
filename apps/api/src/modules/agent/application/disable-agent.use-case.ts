import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import {
  AGENT_CREDENTIAL_REPOSITORY,
  AgentCredentialRepository,
} from "../../identity/domain/ports/agent-credential.repository.port";
import { Agent } from "../domain/agent";
import { AGENT_REPOSITORY, AgentRepository } from "../domain/ports/agent.repository.port";
import { AgentNotFoundError } from "./agent-application.errors";

/** Decommissions an agent: excluded from broadcasts/assignment/session eligibility, and its credential is revoked so it can't authenticate even if it tries. */
@Injectable()
export class DisableAgentUseCase {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(AGENT_CREDENTIAL_REPOSITORY) private readonly agentCredentials: AgentCredentialRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(agentId: string): Promise<Result<Agent, AgentNotFoundError>> {
    const agent = await this.agents.findById(UniqueEntityId.create(agentId));
    if (!agent) {
      return Result.fail(new AgentNotFoundError(agentId));
    }

    agent.disable();
    await this.agents.save(agent);

    const credential = await this.agentCredentials.findByAgentId(agentId);
    if (credential) {
      credential.revoke(new Date());
      await this.agentCredentials.save(credential);
    }

    this.eventPublisher.publishAll(agent.domainEvents);
    agent.clearEvents();

    return Result.ok(agent);
  }
}
