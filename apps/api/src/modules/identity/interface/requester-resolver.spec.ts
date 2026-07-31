import { ActorType } from "@repo/db";

import { AgentCredential } from "../domain/agent-credential";
import { RequesterResolver } from "./requester-resolver";

describe("RequesterResolver", () => {
  it("resolves a human requester from a valid JWT", async () => {
    const tokenService = { verify: jest.fn().mockReturnValue({ sub: "user-1", kind: "user" }), sign: jest.fn() };
    const verifyAgentToken = { execute: jest.fn() };
    const resolver = new RequesterResolver(tokenService, verifyAgentToken as never);

    const requester = await resolver.resolve("a.jwt.token");

    expect(requester).toEqual({ type: ActorType.HUMAN, id: "user-1" });
  });

  it("returns null for an invalid JWT", async () => {
    const tokenService = {
      verify: jest.fn().mockImplementation(() => {
        throw new Error("bad token");
      }),
      sign: jest.fn(),
    };
    const verifyAgentToken = { execute: jest.fn() };
    const resolver = new RequesterResolver(tokenService, verifyAgentToken as never);

    await expect(resolver.resolve("garbage")).resolves.toBeNull();
  });

  it("resolves an agent requester from a valid agent_ token", async () => {
    const tokenService = { verify: jest.fn(), sign: jest.fn() };
    const credential = AgentCredential.create({ agentId: "agent-1", tokenHash: "hash" });
    const verifyAgentToken = { execute: jest.fn().mockResolvedValue(credential) };
    const resolver = new RequesterResolver(tokenService, verifyAgentToken as never);

    const requester = await resolver.resolve("agent_abc.secret");

    expect(requester).toEqual({ type: ActorType.AGENT, id: "agent-1" });
  });

  it("returns null for a revoked or unknown agent token", async () => {
    const tokenService = { verify: jest.fn(), sign: jest.fn() };
    const verifyAgentToken = { execute: jest.fn().mockResolvedValue(null) };
    const resolver = new RequesterResolver(tokenService, verifyAgentToken as never);

    await expect(resolver.resolve("agent_abc.secret")).resolves.toBeNull();
  });
});
