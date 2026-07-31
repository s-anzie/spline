import { AgentStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Agent } from "../domain/agent";
import { AgentNotFoundError } from "./agent-application.errors";
import { UpdateAgentPresenceUseCase } from "./update-agent-presence.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

describe("UpdateAgentPresenceUseCase", () => {
  it("marks an OFFLINE agent ONLINE on connect", async () => {
    const agents = new InMemoryAgentRepository();
    const eventPublisher = new FakeEventPublisher();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    await agents.save(agent);
    const useCase = new UpdateAgentPresenceUseCase(agents, eventPublisher);

    await useCase.execute({ agentId: agent.id.toString(), connected: true });

    const found = await agents.findById(agent.id);
    expect(found?.status).toBe(AgentStatus.ONLINE);
  });

  it("is idempotent: connecting an already-ONLINE agent does not throw or record a new event", async () => {
    const agents = new InMemoryAgentRepository();
    const eventPublisher = new FakeEventPublisher();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    agent.changeStatus(AgentStatus.ONLINE);
    agent.clearEvents();
    await agents.save(agent);
    const useCase = new UpdateAgentPresenceUseCase(agents, eventPublisher);

    const result = await useCase.execute({ agentId: agent.id.toString(), connected: true });

    expect(result.isSuccess).toBe(true);
    expect(eventPublisher.published).toEqual([]);
  });

  it("marks an ONLINE agent OFFLINE on disconnect", async () => {
    const agents = new InMemoryAgentRepository();
    const eventPublisher = new FakeEventPublisher();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    agent.changeStatus(AgentStatus.ONLINE);
    await agents.save(agent);
    const useCase = new UpdateAgentPresenceUseCase(agents, eventPublisher);

    await useCase.execute({ agentId: agent.id.toString(), connected: false });

    const found = await agents.findById(agent.id);
    expect(found?.status).toBe(AgentStatus.OFFLINE);
  });

  it("is idempotent: disconnecting an already-OFFLINE agent does not throw", async () => {
    const agents = new InMemoryAgentRepository();
    const eventPublisher = new FakeEventPublisher();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    await agents.save(agent);
    const useCase = new UpdateAgentPresenceUseCase(agents, eventPublisher);

    const result = await useCase.execute({ agentId: agent.id.toString(), connected: false });

    expect(result.isSuccess).toBe(true);
  });

  it("marks a BUSY agent OFFLINE on disconnect (still connected work is interrupted)", async () => {
    const agents = new InMemoryAgentRepository();
    const eventPublisher = new FakeEventPublisher();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    agent.changeStatus(AgentStatus.ONLINE);
    agent.changeStatus(AgentStatus.BUSY);
    await agents.save(agent);
    const useCase = new UpdateAgentPresenceUseCase(agents, eventPublisher);

    await useCase.execute({ agentId: agent.id.toString(), connected: false });

    const found = await agents.findById(agent.id);
    expect(found?.status).toBe(AgentStatus.OFFLINE);
  });

  it("marks an ERROR agent OFFLINE on disconnect", async () => {
    const agents = new InMemoryAgentRepository();
    const eventPublisher = new FakeEventPublisher();
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    agent.changeStatus(AgentStatus.ONLINE);
    agent.changeStatus(AgentStatus.ERROR);
    await agents.save(agent);
    const useCase = new UpdateAgentPresenceUseCase(agents, eventPublisher);

    await useCase.execute({ agentId: agent.id.toString(), connected: false });

    const found = await agents.findById(agent.id);
    expect(found?.status).toBe(AgentStatus.OFFLINE);
  });

  it("fails when the agent does not exist", async () => {
    const useCase = new UpdateAgentPresenceUseCase(new InMemoryAgentRepository(), new FakeEventPublisher());

    const result = await useCase.execute({ agentId: "unknown", connected: true });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentNotFoundError);
  });
});
