import { MACHINE_TOKEN_PREFIX } from "./machine-token-format";
import { IssueMachineTokenUseCase } from "./issue-machine-token.use-case";
import { FakePasswordHasher } from "./testing/fake-password-hasher";
import { InMemoryMachineCredentialRepository } from "./testing/in-memory-machine-credential.repository";

describe("IssueMachineTokenUseCase", () => {
  it("issues a token shaped as 'machine_<credentialId>.<secret>' and stores only its hash", async () => {
    const credentials = new InMemoryMachineCredentialRepository();
    const useCase = new IssueMachineTokenUseCase(credentials, new FakePasswordHasher());

    const { plainTextToken, credential } = await useCase.execute("machine-1");

    const [credentialId, secret] = plainTextToken.slice(MACHINE_TOKEN_PREFIX.length).split(".");
    expect(plainTextToken.startsWith(MACHINE_TOKEN_PREFIX)).toBe(true);
    expect(credentialId).toBe(credential.id.toString());
    expect(secret).toBeTruthy();
    expect(credential.tokenHash).toBe(`hashed:${secret}`);
    expect(credential.machineId).toBe("machine-1");
  });

  it("persists the credential so it can be found by machine id", async () => {
    const credentials = new InMemoryMachineCredentialRepository();
    const useCase = new IssueMachineTokenUseCase(credentials, new FakePasswordHasher());

    await useCase.execute("machine-1");

    await expect(credentials.findByMachineId("machine-1")).resolves.not.toBeNull();
  });
});
