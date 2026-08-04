import { buildActorToken, parseActorToken } from "./actor-token";

describe("actor token format", () => {
  it("builds <type>_<credentialId>.<secret>", () => {
    expect(buildActorToken("AGENT", "cred-1", "s3cret")).toBe("agent_cred-1.s3cret");
    expect(buildActorToken("WORKER", "cred-2", "x")).toBe("worker_cred-2.x");
  });

  it("parses its own output back", () => {
    const raw = buildActorToken("AGENT", "cred-1", "s3cret");

    const result = parseActorToken(raw);

    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual({
      actorType: "AGENT",
      credentialId: "cred-1",
      secret: "s3cret",
    });
  });

  it("accepts secrets containing dots", () => {
    const result = parseActorToken("service_c1.ab.cd.ef");

    expect(result.value.secret).toBe("ab.cd.ef");
  });

  it("rejects human as a token type — humans use JWT, never opaque tokens", () => {
    expect(parseActorToken("human_c1.secret").isFailure).toBe(true);
  });

  it("rejects malformed tokens", () => {
    for (const raw of ["", "agent_", "agent_c1", "agent_c1.", "_c1.s", "unknown_c1.s", "agentc1.s"]) {
      expect(parseActorToken(raw).isFailure).toBe(true);
    }
  });

  it("failure is a MalformedActorTokenError", () => {
    expect(parseActorToken("garbage").error.name).toBe("MalformedActorTokenError");
  });
});
