import { AgentStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Agent } from "../domain/agent";
import { AgentNotFoundError } from "./agent-application.errors";
import { ForceAgentOfflineUseCase } from "./force-agent-offline.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

describe("ForceAgentOfflineUseCase", () => {
  it("forces an ONLINE agent OFFLINE", async () => {
    const agents = new InMemoryAgentRepository();
    const eventPublisher = new FakeEventPublisher();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    agent.changeStatus(AgentStatus.ONLINE);
    await agents.save(agent);
    const useCase = new ForceAgentOfflineUseCase(agents, eventPublisher);

    const result = await useCase.execute(agent.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(AgentStatus.OFFLINE);
  });

  it("is a no-op when the agent is already OFFLINE", async () => {
    const agents = new InMemoryAgentRepository();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    await agents.save(agent);
    const useCase = new ForceAgentOfflineUseCase(agents, new FakeEventPublisher());

    const result = await useCase.execute(agent.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(AgentStatus.OFFLINE);
  });

  it("fails when the agent does not exist", async () => {
    const useCase = new ForceAgentOfflineUseCase(new InMemoryAgentRepository(), new FakeEventPublisher());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentNotFoundError);
  });
});
