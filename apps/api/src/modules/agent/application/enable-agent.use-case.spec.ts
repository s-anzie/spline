import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { FakePasswordHasher } from "../../identity/application/testing/fake-password-hasher";
import { AGENT_TOKEN_PREFIX } from "../../identity/application/agent-token-format";
import { InMemoryAgentCredentialRepository } from "../../identity/application/testing/in-memory-agent-credential.repository";
import { AgentCredential } from "../../identity/domain/agent-credential";
import { Agent } from "../domain/agent";
import { AgentNotFoundError } from "./agent-application.errors";
import { EnableAgentUseCase } from "./enable-agent.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

async function setup() {
  const agents = new InMemoryAgentRepository();
  const agentCredentials = new InMemoryAgentCredentialRepository();
  const eventPublisher = new FakeEventPublisher();
  const useCase = new EnableAgentUseCase(agents, agentCredentials, new FakePasswordHasher(), eventPublisher);

  const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
  agent.disable();
  agent.clearEvents();
  await agents.save(agent);
  const credential = AgentCredential.create({
    agentId: agent.id.toString(),
    tokenHash: "hash",
    revokedAt: new Date(),
  });
  await agentCredentials.save(credential);

  return { agents, agentCredentials, credential, agent, eventPublisher, useCase };
}

describe("EnableAgentUseCase", () => {
  it("re-enables the agent and issues a fresh usable token", async () => {
    const { agents, agentCredentials, agent, credential, eventPublisher, useCase } = await setup();

    const result = await useCase.execute(agent.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.agent.isDisabled).toBe(false);
    expect(result.value.token?.startsWith(AGENT_TOKEN_PREFIX)).toBe(true);
    const persisted = await agents.findById(agent.id);
    expect(persisted?.isDisabled).toBe(false);
    const persistedCredential = await agentCredentials.findById(credential.id);
    expect(persistedCredential?.isActive()).toBe(true);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["agent.enabled"]);
  });

  it("is idempotent when the agent is not disabled (still rotates the token)", async () => {
    const { agent, useCase } = await setup();
    await useCase.execute(agent.id.toString());

    const result = await useCase.execute(agent.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.agent.isDisabled).toBe(false);
  });

  it("returns a null token when the agent has no credential row", async () => {
    const agents = new InMemoryAgentRepository();
    const agentCredentials = new InMemoryAgentCredentialRepository();
    const eventPublisher = new FakeEventPublisher();
    const useCase = new EnableAgentUseCase(agents, agentCredentials, new FakePasswordHasher(), eventPublisher);
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    agent.disable();
    await agents.save(agent);

    const result = await useCase.execute(agent.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.token).toBeNull();
  });

  it("fails when the agent does not exist", async () => {
    const { useCase } = await setup();

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentNotFoundError);
  });
});
