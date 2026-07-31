import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryMachineCredentialRepository } from "../../identity/application/testing/in-memory-machine-credential.repository";
import { FakePasswordHasher } from "../../identity/application/testing/fake-password-hasher";
import { IssueMachineTokenUseCase } from "../../identity/application/issue-machine-token.use-case";
import { MACHINE_TOKEN_PREFIX } from "../../identity/application/machine-token-format";
import { EmptyMachineHostnameError } from "../domain/local-machine.errors";
import { RegisterMachineUseCase } from "./register-machine.use-case";
import { InMemoryLocalMachineRepository } from "./testing/in-memory-local-machine.repository";

function setup() {
  const machines = new InMemoryLocalMachineRepository();
  const issueMachineToken = new IssueMachineTokenUseCase(
    new InMemoryMachineCredentialRepository(),
    new FakePasswordHasher(),
  );
  const useCase = new RegisterMachineUseCase(machines, issueMachineToken, new FakeEventPublisher());
  return { machines, useCase };
}

describe("RegisterMachineUseCase", () => {
  it("registers a machine and issues a token", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ hostname: "bradley-dev", os: "linux" });

    expect(result.isSuccess).toBe(true);
    expect(result.value.machine.hostname).toBe("bradley-dev");
    expect(result.value.machine.workspaceIds).toEqual([]);
    expect(result.value.plainTextToken.startsWith(MACHINE_TOKEN_PREFIX)).toBe(true);
  });

  it("fails with an empty hostname", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ hostname: "  ", os: "linux" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyMachineHostnameError);
  });
});
