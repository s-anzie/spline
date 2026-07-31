import { IssueMachineTokenUseCase } from "./issue-machine-token.use-case";
import { FakePasswordHasher } from "./testing/fake-password-hasher";
import { InMemoryMachineCredentialRepository } from "./testing/in-memory-machine-credential.repository";
import { VerifyMachineTokenUseCase } from "./verify-machine-token.use-case";

describe("VerifyMachineTokenUseCase", () => {
  async function setup() {
    const credentials = new InMemoryMachineCredentialRepository();
    const passwordHasher = new FakePasswordHasher();
    const issueUseCase = new IssueMachineTokenUseCase(credentials, passwordHasher);
    const verifyUseCase = new VerifyMachineTokenUseCase(credentials, passwordHasher);
    const { plainTextToken, credential } = await issueUseCase.execute("machine-1");
    return { credentials, verifyUseCase, plainTextToken, credential };
  }

  it("resolves the credential for a valid token", async () => {
    const { verifyUseCase, plainTextToken, credential } = await setup();

    const result = await verifyUseCase.execute(plainTextToken);

    expect(result?.id.equals(credential.id)).toBe(true);
  });

  it("rejects a token with a tampered secret", async () => {
    const { verifyUseCase, plainTextToken } = await setup();
    const [credentialId] = plainTextToken.split(".");
    const tampered = `${credentialId}.not-the-real-secret`;

    await expect(verifyUseCase.execute(tampered)).resolves.toBeNull();
  });

  it("rejects a malformed token", async () => {
    const { verifyUseCase } = await setup();

    await expect(verifyUseCase.execute("no-separator-here")).resolves.toBeNull();
  });

  it("rejects a token for a revoked credential", async () => {
    const { verifyUseCase, plainTextToken, credential } = await setup();
    credential.revoke(new Date());

    await expect(verifyUseCase.execute(plainTextToken)).resolves.toBeNull();
  });
});
