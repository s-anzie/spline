import { AGENT_TOKEN_PREFIX } from "./agent-token-format";
import { IssueAgentTokenUseCase } from "./issue-agent-token.use-case";
import { FakePasswordHasher } from "./testing/fake-password-hasher";
import { InMemoryAgentCredentialRepository } from "./testing/in-memory-agent-credential.repository";

describe("IssueAgentTokenUseCase", () => {
  it("issues a token shaped as 'agent_<credentialId>.<secret>' and stores only its hash", async () => {
    const credentials = new InMemoryAgentCredentialRepository();
    const useCase = new IssueAgentTokenUseCase(credentials, new FakePasswordHasher());

    const { plainTextToken, credential } = await useCase.execute("agent-1");

    const [credentialId, secret] = plainTextToken.slice(AGENT_TOKEN_PREFIX.length).split(".");
    expect(plainTextToken.startsWith(AGENT_TOKEN_PREFIX)).toBe(true);
    expect(credentialId).toBe(credential.id.toString());
    expect(secret).toBeTruthy();
    expect(credential.tokenHash).toBe(`hashed:${secret}`);
    expect(credential.agentId).toBe("agent-1");
  });

  it("persists the credential so it can be found by agent id", async () => {
    const credentials = new InMemoryAgentCredentialRepository();
    const useCase = new IssueAgentTokenUseCase(credentials, new FakePasswordHasher());

    await useCase.execute("agent-1");

    await expect(credentials.findByAgentId("agent-1")).resolves.not.toBeNull();
  });
});
