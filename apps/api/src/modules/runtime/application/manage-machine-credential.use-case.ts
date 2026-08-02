import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { MACHINE_TOKEN_PREFIX } from "../../identity/application/machine-token-format";
import {
  PASSWORD_HASHER,
  PasswordHasher,
} from "../../identity/application/ports/password-hasher.port";
import {
  MACHINE_CREDENTIAL_REPOSITORY,
  MachineCredentialRepository,
} from "../../identity/domain/ports/machine-credential.repository.port";
import {
  LOCAL_MACHINE_REPOSITORY,
  LocalMachineRepository,
} from "../domain/ports/local-machine.repository.port";
import {
  MachineNotFoundError,
  MachineNotLinkedToWorkspaceError,
} from "./runtime-application.errors";

@Injectable()
export class ManageMachineCredentialUseCase {
  constructor(
    @Inject(LOCAL_MACHINE_REPOSITORY)
    private readonly machines: LocalMachineRepository,
    @Inject(MACHINE_CREDENTIAL_REPOSITORY)
    private readonly credentials: MachineCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  private async credentialFor(workspaceId: string, machineId: string) {
    const machine = await this.machines.findById(
      UniqueEntityId.create(machineId),
    );
    if (!machine) throw new MachineNotFoundError(machineId);
    if (!machine.workspaceIds.includes(workspaceId))
      throw new MachineNotLinkedToWorkspaceError(machineId, workspaceId);
    const credential = await this.credentials.findByMachineId(machineId);
    if (!credential) throw new MachineNotFoundError(machineId);
    return credential;
  }

  async rotate(workspaceId: string, machineId: string): Promise<string> {
    const credential = await this.credentialFor(workspaceId, machineId);
    const secret = randomBytes(32).toString("hex");
    credential.rotate(await this.passwordHasher.hash(secret));
    await this.credentials.save(credential);
    return `${MACHINE_TOKEN_PREFIX}${credential.id.toString()}.${secret}`;
  }

  async revoke(workspaceId: string, machineId: string): Promise<void> {
    const credential = await this.credentialFor(workspaceId, machineId);
    credential.revoke(new Date());
    await this.credentials.save(credential);
  }
}
