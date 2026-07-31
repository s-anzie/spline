import { AgentSession } from "../domain/agent-session";
import { AgentSessionNotFoundError } from "./runtime-application.errors";
import { GetAgentSessionUseCase } from "./get-agent-session.use-case";
import { InMemoryAgentSessionRepository } from "./testing/in-memory-agent-session.repository";

describe("GetAgentSessionUseCase", () => {
  it("returns the session when it exists", async () => {
    const sessions = new InMemoryAgentSessionRepository();
    const session = AgentSession.start({ agentId: "agent-1", provider: "claude", workspaceId: "w1", machineId: "m1" });
    await sessions.save(session);
    const useCase = new GetAgentSessionUseCase(sessions);

    const result = await useCase.execute(session.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.agentId).toBe("agent-1");
  });

  it("fails when the session does not exist", async () => {
    const useCase = new GetAgentSessionUseCase(new InMemoryAgentSessionRepository());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentSessionNotFoundError);
  });
});
