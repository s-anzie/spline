import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import {
  AGENT_CREDENTIAL_REPOSITORY,
  AgentCredentialRepository,
} from "../domain/ports/agent-credential.repository.port";
import { AgentCredential } from "../domain/agent-credential";
import { AGENT_TOKEN_PREFIX } from "./agent-token-format";
import { PASSWORD_HASHER, PasswordHasher } from "./ports/password-hasher.port";

export interface IssueAgentTokenOutput {
  /** Shown to the caller once; only its hash is persisted. */
  plainTextToken: string;
  credential: AgentCredential;
}

@Injectable()
export class IssueAgentTokenUseCase {
  constructor(
    @Inject(AGENT_CREDENTIAL_REPOSITORY) private readonly credentials: AgentCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(agentId: string): Promise<IssueAgentTokenOutput> {
    const secret = randomBytes(32).toString("hex");
    const tokenHash = await this.passwordHasher.hash(secret);
    const credential = AgentCredential.create({ agentId, tokenHash });

    await this.credentials.save(credential);

    return {
      plainTextToken: `${AGENT_TOKEN_PREFIX}${credential.id.toString()}.${secret}`,
      credential,
    };
  }
}
