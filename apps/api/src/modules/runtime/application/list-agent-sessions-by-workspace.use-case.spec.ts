import { AgentSession } from "../domain/agent-session";
import { ListAgentSessionsByWorkspaceUseCase } from "./list-agent-sessions-by-workspace.use-case";
import { InMemoryAgentSessionRepository } from "./testing/in-memory-agent-session.repository";

describe("ListAgentSessionsByWorkspaceUseCase", () => {
  it("lists sessions scoped to a workspace", async () => {
    const sessions = new InMemoryAgentSessionRepository();
    await sessions.save(
      AgentSession.start({ agentId: "agent-1", provider: "claude", workspaceId: "w1", machineId: "m1" }),
    );
    await sessions.save(
      AgentSession.start({ agentId: "agent-2", provider: "codex", workspaceId: "w2", machineId: "m1" }),
    );
    const useCase = new ListAgentSessionsByWorkspaceUseCase(sessions);

    const found = await useCase.execute("w1");

    expect(found.map((s) => s.agentId)).toEqual(["agent-1"]);
  });
});
