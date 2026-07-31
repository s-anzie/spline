import { Agent } from "../domain/agent";
import { AgentNotFoundError } from "./agent-application.errors";
import { GetAgentUseCase } from "./get-agent.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

describe("GetAgentUseCase", () => {
  it("returns the agent when it exists", async () => {
    const agents = new InMemoryAgentRepository();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    await agents.save(agent);
    const useCase = new GetAgentUseCase(agents);

    const result = await useCase.execute(agent.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.displayName).toBe("Worker");
  });

  it("fails when the agent does not exist", async () => {
    const useCase = new GetAgentUseCase(new InMemoryAgentRepository());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentNotFoundError);
  });
});
