import { AgentHealthState } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Agent } from "../domain/agent";
import { AgentNotFoundError } from "./agent-application.errors";
import { UpdateAgentHealthUseCase } from "./update-agent-health.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

describe("UpdateAgentHealthUseCase", () => {
  it("updates the health of an existing agent and publishes the event", async () => {
    const agents = new InMemoryAgentRepository();
    const eventPublisher = new FakeEventPublisher();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    agent.clearEvents();
    await agents.save(agent);
    const useCase = new UpdateAgentHealthUseCase(agents, eventPublisher);

    const result = await useCase.execute({ agentId: agent.id.toString(), healthState: AgentHealthState.HEALTHY });

    expect(result.isSuccess).toBe(true);
    expect(result.value.healthState).toBe(AgentHealthState.HEALTHY);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["agent.health_changed"]);
  });

  it("fails when the agent does not exist", async () => {
    const useCase = new UpdateAgentHealthUseCase(new InMemoryAgentRepository(), new FakeEventPublisher());

    const result = await useCase.execute({ agentId: "unknown", healthState: AgentHealthState.HEALTHY });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentNotFoundError);
  });
});
