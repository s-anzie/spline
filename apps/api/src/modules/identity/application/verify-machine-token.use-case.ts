import { Inject, Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { MachineCredential } from "../domain/machine-credential";
import {
  MACHINE_CREDENTIAL_REPOSITORY,
  MachineCredentialRepository,
} from "../domain/ports/machine-credential.repository.port";
import { MACHINE_TOKEN_PREFIX } from "./machine-token-format";
import { PASSWORD_HASHER, PasswordHasher } from "./ports/password-hasher.port";

@Injectable()
export class VerifyMachineTokenUseCase {
  constructor(
    @Inject(MACHINE_CREDENTIAL_REPOSITORY) private readonly credentials: MachineCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(plainTextToken: string): Promise<MachineCredential | null> {
    if (!plainTextToken.startsWith(MACHINE_TOKEN_PREFIX)) {
      return null;
    }
    const withoutPrefix = plainTextToken.slice(MACHINE_TOKEN_PREFIX.length);

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
