import { Inject, Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentCredential } from "../domain/agent-credential";
import {
  AGENT_CREDENTIAL_REPOSITORY,
  AgentCredentialRepository,
} from "../domain/ports/agent-credential.repository.port";
import { AGENT_TOKEN_PREFIX } from "./agent-token-format";
import { PASSWORD_HASHER, PasswordHasher } from "./ports/password-hasher.port";

@Injectable()
export class VerifyAgentTokenUseCase {
  constructor(
    @Inject(AGENT_CREDENTIAL_REPOSITORY) private readonly credentials: AgentCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(plainTextToken: string): Promise<AgentCredential | null> {
    if (!plainTextToken.startsWith(AGENT_TOKEN_PREFIX)) {
      return null;
    }
    const withoutPrefix = plainTextToken.slice(AGENT_TOKEN_PREFIX.length);

    const separatorIndex = withoutPrefix.indexOf(".");
    if (separatorIndex === -1) {
      return null;
    }

    const credentialId = withoutPrefix.slice(0, separatorIndex);
    const secret = withoutPrefix.slice(separatorIndex + 1);

    const credential = await this.credentials.findById(UniqueEntityId.create(credentialId));
    if (!credential || !credential.isActive()) {
      return null;
    }

    const matches = await this.passwordHasher.compare(secret, credential.tokenHash);
    return matches ? credential : null;
  }
}
