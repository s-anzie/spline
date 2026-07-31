import { Agent } from "../domain/agent";
import { ListAgentsByWorkspaceUseCase } from "./list-agents-by-workspace.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

describe("ListAgentsByWorkspaceUseCase", () => {
  it("lists agents scoped to a workspace", async () => {
    const agents = new InMemoryAgentRepository();
    await agents.save(Agent.create({ workspaceId: "w1", provider: "claude", displayName: "A" }));
    await agents.save(Agent.create({ workspaceId: "w2", provider: "codex", displayName: "B" }));
    const useCase = new ListAgentsByWorkspaceUseCase(agents);

    const found = await useCase.execute("w1");

    expect(found.map((a) => a.displayName)).toEqual(["A"]);
  });
});
