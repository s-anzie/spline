import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryAgentCredentialRepository } from "../../identity/application/testing/in-memory-agent-credential.repository";
import { AgentCredential } from "../../identity/domain/agent-credential";
import { Agent } from "../domain/agent";
import { AgentNotFoundError } from "./agent-application.errors";
import { DisableAgentUseCase } from "./disable-agent.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

async function setup() {
  const agents = new InMemoryAgentRepository();
  const agentCredentials = new InMemoryAgentCredentialRepository();
  const eventPublisher = new FakeEventPublisher();
  const useCase = new DisableAgentUseCase(agents, agentCredentials, eventPublisher);

  const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
  agent.clearEvents();
  await agents.save(agent);
  const credential = AgentCredential.create({ agentId: agent.id.toString(), tokenHash: "hash" });
  await agentCredentials.save(credential);

  return { agents, agentCredentials, credential, agent, eventPublisher, useCase };
}

describe("DisableAgentUseCase", () => {
  it("disables the agent and revokes its credential", async () => {
    const { agents, agentCredentials, agent, credential, eventPublisher, useCase } = await setup();

    const result = await useCase.execute(agent.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.isDisabled).toBe(true);
    const persisted = await agents.findById(agent.id);
    expect(persisted?.isDisabled).toBe(true);
    const persistedCredential = await agentCredentials.findById(credential.id);
    expect(persistedCredential?.isActive()).toBe(false);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["agent.disabled"]);
  });

  it("is idempotent when the agent is already disabled", async () => {
    const { agent, useCase } = await setup();
    await useCase.execute(agent.id.toString());

    const result = await useCase.execute(agent.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.isDisabled).toBe(true);
  });

  it("succeeds even when the agent has no credential row", async () => {
    const agents = new InMemoryAgentRepository();
    const agentCredentials = new InMemoryAgentCredentialRepository();
    const eventPublisher = new FakeEventPublisher();
    const useCase = new DisableAgentUseCase(agents, agentCredentials, eventPublisher);
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    await agents.save(agent);

    const result = await useCase.execute(agent.id.toString());

    expect(result.isSuccess).toBe(true);
  });

  it("fails when the agent does not exist", async () => {
    const { useCase } = await setup();

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentNotFoundError);
  });
});
