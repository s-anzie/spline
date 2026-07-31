import { AgentCredential } from "./agent-credential";

describe("AgentCredential", () => {
  it("is active right after creation", () => {
    const credential = AgentCredential.create({ agentId: "agent-1", tokenHash: "hash" });

    expect(credential.isActive()).toBe(true);
    expect(credential.revokedAt).toBeUndefined();
  });

  it("becomes inactive once revoked", () => {
    const credential = AgentCredential.create({ agentId: "agent-1", tokenHash: "hash" });

    credential.revoke(new Date());

    expect(credential.isActive()).toBe(false);
    expect(credential.revokedAt).toBeInstanceOf(Date);
  });
});
