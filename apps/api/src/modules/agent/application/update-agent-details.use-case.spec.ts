import { Agent } from "../domain/agent";
import { EmptyAgentDisplayNameError, EmptyAgentProviderError } from "../domain/agent.errors";
import { AgentNotFoundError } from "./agent-application.errors";
import { UpdateAgentDetailsUseCase } from "./update-agent-details.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

describe("UpdateAgentDetailsUseCase", () => {
  it("updates the details of an existing agent", async () => {
    const agents = new InMemoryAgentRepository();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Old" });
    await agents.save(agent);
    const useCase = new UpdateAgentDetailsUseCase(agents);

    const result = await useCase.execute({
      agentId: agent.id.toString(),
      displayName: "New",
      capabilities: ["code_edit"],
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.displayName).toBe("New");
    expect(result.value.capabilities).toEqual(["code_edit"]);
  });

  it("fails when the agent does not exist", async () => {
    const useCase = new UpdateAgentDetailsUseCase(new InMemoryAgentRepository());

    const result = await useCase.execute({ agentId: "unknown", displayName: "New" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentNotFoundError);
  });

  it("fails when renaming to an empty display name", async () => {
    const agents = new InMemoryAgentRepository();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Old" });
    await agents.save(agent);
    const useCase = new UpdateAgentDetailsUseCase(agents);

    const result = await useCase.execute({ agentId: agent.id.toString(), displayName: "   " });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyAgentDisplayNameError);
  });

  it("updates the provider of an existing agent", async () => {
    const agents = new InMemoryAgentRepository();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    await agents.save(agent);
    const useCase = new UpdateAgentDetailsUseCase(agents);

    const result = await useCase.execute({ agentId: agent.id.toString(), provider: "codex" });

    expect(result.isSuccess).toBe(true);
    expect(result.value.provider).toBe("codex");
  });

  it("fails when updating to an empty provider", async () => {
    const agents = new InMemoryAgentRepository();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    await agents.save(agent);
    const useCase = new UpdateAgentDetailsUseCase(agents);

    const result = await useCase.execute({ agentId: agent.id.toString(), provider: "   " });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyAgentProviderError);
  });
});
