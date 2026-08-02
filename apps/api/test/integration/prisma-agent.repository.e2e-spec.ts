import { AgentHealthState, AgentStatus } from "@repo/db";

import { PrismaAgentRepository } from "../../src/modules/agent/infrastructure/prisma-agent.repository";
import { Agent } from "../../src/modules/agent/domain/agent";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaAgentRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaAgentRepository;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaAgentRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists an agent and finds it back by id", async () => {
    const agent = Agent.create({
      workspaceId,
      provider: "claude",
      displayName: "Claude worker #1",
      capabilities: ["code_edit"],
    });

    await repository.save(agent);
    const found = await repository.findById(agent.id);

    expect(found?.displayName).toBe("Claude worker #1");
    expect(found?.provider).toBe("claude");
    expect(found?.capabilities).toEqual(["code_edit"]);
    expect(found?.status).toBe(AgentStatus.OFFLINE);
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists agents scoped to a workspace", async () => {
    await repository.save(Agent.create({ workspaceId, provider: "claude", displayName: "A" }));
    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other" } });
    await repository.save(
      Agent.create({ workspaceId: otherWorkspace.id, provider: "codex", displayName: "B" }),
    );

    const found = await repository.listByWorkspace(workspaceId);

    expect(found.map((a) => a.displayName)).toEqual(["A"]);
  });

  it("persists status, health and task assignment changes on save", async () => {
    const agent = Agent.create({ workspaceId, provider: "claude", displayName: "Worker" });
    await repository.save(agent);

    agent.changeStatus(AgentStatus.ONLINE);
    agent.updateHealth(AgentHealthState.HEALTHY);
    agent.assignToTask("task-1");
    await repository.save(agent);

    const found = await repository.findById(agent.id);
    expect(found?.status).toBe(AgentStatus.ONLINE);
    expect(found?.healthState).toBe(AgentHealthState.HEALTHY);
    expect(found?.currentTaskId).toBe("task-1");
    expect(found?.lastSeenAt).not.toBeNull();
  });

  it("persists a provider change on save", async () => {
    const agent = Agent.create({ workspaceId, provider: "claude", displayName: "Worker" });
    await repository.save(agent);

    agent.updateDetails({ provider: "codex" });
    await repository.save(agent);

    const found = await repository.findById(agent.id);
    expect(found?.provider).toBe("codex");
  });

  it("persists disable/enable (disabledAt) changes on save", async () => {
    const agent = Agent.create({ workspaceId, provider: "claude", displayName: "Worker" });
    await repository.save(agent);

    agent.disable();
    await repository.save(agent);
    const disabled = await repository.findById(agent.id);
    expect(disabled?.isDisabled).toBe(true);
    expect(disabled?.disabledAt).not.toBeNull();

    agent.enable();
    await repository.save(agent);
    const enabled = await repository.findById(agent.id);
    expect(enabled?.isDisabled).toBe(false);
    expect(enabled?.disabledAt).toBeUndefined();
  });
});
