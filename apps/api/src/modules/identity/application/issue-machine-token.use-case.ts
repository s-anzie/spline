import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import {
  MACHINE_CREDENTIAL_REPOSITORY,
  MachineCredentialRepository,
} from "../domain/ports/machine-credential.repository.port";
import { MachineCredential } from "../domain/machine-credential";
import { MACHINE_TOKEN_PREFIX } from "./machine-token-format";
import { PASSWORD_HASHER, PasswordHasher } from "./ports/password-hasher.port";

export interface IssueMachineTokenOutput {
  /** Shown to the caller once; only its hash is persisted. */
  plainTextToken: string;
  credential: MachineCredential;
}

@Injectable()
export class IssueMachineTokenUseCase {
  constructor(
    @Inject(MACHINE_CREDENTIAL_REPOSITORY) private readonly credentials: MachineCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(machineId: string): Promise<IssueMachineTokenOutput> {
    const secret = randomBytes(32).toString("hex");
    const tokenHash = await this.passwordHasher.hash(secret);
    const credential = MachineCredential.create({ machineId, tokenHash });

    await this.credentials.save(credential);

    return {
      plainTextToken: `${MACHINE_TOKEN_PREFIX}${credential.id.toString()}.${secret}`,
      credential,
    };
  }
}
