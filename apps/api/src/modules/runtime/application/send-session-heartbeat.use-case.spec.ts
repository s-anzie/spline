import { AgentSession } from "../domain/agent-session";
import { AgentSessionNotFoundError } from "./runtime-application.errors";
import { SendSessionHeartbeatUseCase } from "./send-session-heartbeat.use-case";
import { InMemoryAgentSessionRepository } from "./testing/in-memory-agent-session.repository";

describe("SendSessionHeartbeatUseCase", () => {
  it("records the heartbeat", async () => {
    const sessions = new InMemoryAgentSessionRepository();
    const session = AgentSession.start({ agentId: "agent-1", provider: "claude", workspaceId: "w1", machineId: "m1" });
    await sessions.save(session);
    const useCase = new SendSessionHeartbeatUseCase(sessions);
    const at = new Date("2026-07-31T10:05:00Z");

    const result = await useCase.execute({ sessionId: session.id.toString() }, at);

    expect(result.isSuccess).toBe(true);
    expect(result.value.lastHeartbeatAt).toEqual(at);
  });

  it("fails when the session does not exist", async () => {
    const useCase = new SendSessionHeartbeatUseCase(new InMemoryAgentSessionRepository());

    const result = await useCase.execute({ sessionId: "unknown" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentSessionNotFoundError);
  });
});
