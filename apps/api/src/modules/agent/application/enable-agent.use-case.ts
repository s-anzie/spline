import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AGENT_TOKEN_PREFIX } from "../../identity/application/agent-token-format";
import { PASSWORD_HASHER, PasswordHasher } from "../../identity/application/ports/password-hasher.port";
import {
  AGENT_CREDENTIAL_REPOSITORY,
  AgentCredentialRepository,
} from "../../identity/domain/ports/agent-credential.repository.port";
import { Agent } from "../domain/agent";
import { AGENT_REPOSITORY, AgentRepository } from "../domain/ports/agent.repository.port";
import { AgentNotFoundError } from "./agent-application.errors";

export interface EnableAgentOutput {
  agent: Agent;
  /** The old token was permanently revoked when the agent was disabled — re-enabling always issues a fresh one. */
  token: string | null;
}

/** Reverses DisableAgentUseCase — the old credential can never be un-revoked, so this rotates in a fresh token (if the agent has a credential at all). */
@Injectable()
export class EnableAgentUseCase {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(AGENT_CREDENTIAL_REPOSITORY) private readonly agentCredentials: AgentCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(agentId: string): Promise<Result<EnableAgentOutput, AgentNotFoundError>> {
    const agent = await this.agents.findById(UniqueEntityId.create(agentId));
    if (!agent) {
      return Result.fail(new AgentNotFoundError(agentId));
    }

    agent.enable();
    await this.agents.save(agent);

    const credential = await this.agentCredentials.findByAgentId(agentId);
    let token: string | null = null;
    if (credential) {
      const secret = randomBytes(32).toString("hex");
      credential.rotate(await this.passwordHasher.hash(secret));
      await this.agentCredentials.save(credential);
      token = `${AGENT_TOKEN_PREFIX}${credential.id.toString()}.${secret}`;
    }

    this.eventPublisher.publishAll(agent.domainEvents);
    agent.clearEvents();

    return Result.ok({ agent, token });
  }
}
