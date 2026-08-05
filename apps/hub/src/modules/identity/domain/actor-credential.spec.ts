import { ActorCredential } from "./actor-credential";
import { ActorRef } from "./actor";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");
const agent = ActorRef.create("AGENT", "a-1").value;

describe("ActorCredential", () => {
  it("creates for a non-human actor", () => {
    const result = ActorCredential.create({ actor: agent, organizationId: "org-1", displayName: "worker-01", tokenHash: "$2b$10$h", now });

    expect(result.isSuccess).toBe(true);
    expect(result.value.isRevoked).toBe(false);
    expect(result.value.lastUsedAt).toBeNull();
  });

  it("refuses a credential for a human — humans authenticate with JWT", () => {
    const human = ActorRef.create("HUMAN", "u-1").value;

    const result = ActorCredential.create({ actor: human, organizationId: "org-1", displayName: "u", tokenHash: "$2b$10$h", now });

    expect(result.isFailure).toBe(true);
  });

  it("revoke is idempotent and keeps the first revocation time", () => {
    const credential = ActorCredential.create({ actor: agent, organizationId: "org-1", displayName: "worker-01", tokenHash: "$2b$10$h", now }).value;

    credential.revoke(now);
    credential.revoke(later);

    expect(credential.isRevoked).toBe(true);
    expect(credential.revokedAt).toEqual(now);
  });

  it("touch records the last use", () => {
    const credential = ActorCredential.create({ actor: agent, organizationId: "org-1", displayName: "worker-01", tokenHash: "$2b$10$h", now }).value;

    credential.touch(later);

    expect(credential.lastUsedAt).toEqual(later);
  });

  it("reconstitute rebuilds a revoked credential faithfully", () => {
    const credential = ActorCredential.reconstitute(
      {
        actor: agent,
        organizationId: "org-1",
        displayName: "a",
        tokenHash: "$2b$10$h",
        createdAt: now,
        revokedAt: later,
        lastUsedAt: null,
      },
      "c-1",
    );

    expect(credential.isRevoked).toBe(true);
    expect(credential.domainEvents).toHaveLength(0);
  });
});
