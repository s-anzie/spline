import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AGENT_TOKEN_PREFIX } from "../../identity/application/agent-token-format";
import {
  PASSWORD_HASHER,
  PasswordHasher,
} from "../../identity/application/ports/password-hasher.port";
import {
  AGENT_CREDENTIAL_REPOSITORY,
  AgentCredentialRepository,
} from "../../identity/domain/ports/agent-credential.repository.port";
import { AgentNotFoundError } from "./agent-application.errors";
import {
  AGENT_REPOSITORY,
  AgentRepository,
} from "../domain/ports/agent.repository.port";

@Injectable()
export class ManageAgentCredentialUseCase {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(AGENT_CREDENTIAL_REPOSITORY)
    private readonly credentials: AgentCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  private async credentialFor(workspaceId: string, agentId: string) {
    const agent = await this.agents.findById(UniqueEntityId.create(agentId));
    if (!agent || agent.workspaceId !== workspaceId)
      throw new AgentNotFoundError(agentId);
    const credential = await this.credentials.findByAgentId(agentId);
    if (!credential) throw new AgentNotFoundError(agentId);
    return credential;
  }

  async rotate(workspaceId: string, agentId: string): Promise<string> {
    const credential = await this.credentialFor(workspaceId, agentId);
    const secret = randomBytes(32).toString("hex");
    credential.rotate(await this.passwordHasher.hash(secret));
    await this.credentials.save(credential);
    return `${AGENT_TOKEN_PREFIX}${credential.id.toString()}.${secret}`;
  }

  async revoke(workspaceId: string, agentId: string): Promise<void> {
    const credential = await this.credentialFor(workspaceId, agentId);
    credential.revoke(new Date());
    await this.credentials.save(credential);
  }
}
