import { InMemoryMachineCredentialRepository } from "../../identity/application/testing/in-memory-machine-credential.repository";
import { FakePasswordHasher } from "../../identity/application/testing/fake-password-hasher";
import { MachineCredential } from "../../identity/domain/machine-credential";
import { LocalMachine } from "../domain/local-machine";
import { ManageMachineCredentialUseCase } from "./manage-machine-credential.use-case";
import { InMemoryLocalMachineRepository } from "./testing/in-memory-local-machine.repository";

describe("ManageMachineCredentialUseCase", () => {
  async function setup() {
    const machines = new InMemoryLocalMachineRepository();
    const credentials = new InMemoryMachineCredentialRepository();
    const machine = LocalMachine.register({ hostname: "worker", os: "linux" });
    machine.linkToWorkspace("workspace-1");
    const credential = MachineCredential.create({
      machineId: machine.id.toString(),
      tokenHash: "hashed:old",
    });
    await machines.save(machine);
    await credentials.save(credential);
    return {
      machine,
      credential,
      useCase: new ManageMachineCredentialUseCase(
        machines,
        credentials,
        new FakePasswordHasher(),
      ),
    };
  }

  it("rotates the secret while keeping the credential identifier", async () => {
    const { machine, credential, useCase } = await setup();
    const token = await useCase.rotate("workspace-1", machine.id.toString());
    expect(token).toMatch(
      new RegExp(`^machine_${credential.id.toString()}\\.`),
    );
    expect(credential.tokenHash).not.toBe("hashed:old");
    expect(credential.isActive()).toBe(true);
  });

  it("revokes the active machine credential", async () => {
    const { machine, credential, useCase } = await setup();
    await useCase.revoke("workspace-1", machine.id.toString());
    expect(credential.isActive()).toBe(false);
  });
});
