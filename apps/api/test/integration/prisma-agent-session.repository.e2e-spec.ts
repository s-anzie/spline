import { AgentSessionStatus } from "@repo/db";

import { PrismaAgentSessionRepository } from "../../src/modules/runtime/infrastructure/prisma-agent-session.repository";
import { AgentSession } from "../../src/modules/runtime/domain/agent-session";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaAgentSessionRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaAgentSessionRepository;
  let workspaceId: string;
  let agentId: string;
  let machineId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaAgentSessionRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
    const agent = await prisma.agent.create({
      data: { workspaceId, provider: "claude", displayName: "Worker" },
    });
    agentId = agent.id;
    const machine = await prisma.localMachine.create({ data: { hostname: "bradley-dev", os: "linux" } });
    machineId = machine.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a session and finds it back by id", async () => {
    const session = AgentSession.start({ agentId, provider: "claude", workspaceId, machineId });

    await repository.save(session);
    const found = await repository.findById(session.id);

    expect(found?.agentId).toBe(agentId);
    expect(found?.status).toBe(AgentSessionStatus.STARTING);
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists sessions scoped to a workspace", async () => {
    await repository.save(AgentSession.start({ agentId, provider: "claude", workspaceId, machineId }));
    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other" } });
    const otherAgent = await prisma.agent.create({
      data: { workspaceId: otherWorkspace.id, provider: "codex", displayName: "Other" },
    });
    await repository.save(
      AgentSession.start({ agentId: otherAgent.id, provider: "codex", workspaceId: otherWorkspace.id, machineId }),
    );

    const found = await repository.listByWorkspace(workspaceId);

    expect(found.map((s) => s.agentId)).toEqual([agentId]);
  });

  it("lists active sessions for an agent, excluding terminal ones", async () => {
    const terminal = AgentSession.start({ agentId, provider: "claude", workspaceId, machineId });
    terminal.changeStatus(AgentSessionStatus.RUNNING);
    terminal.changeStatus(AgentSessionStatus.COMPLETED);
    await repository.save(terminal);

    const active = await repository.listActiveByAgent(agentId);
    expect(active).toEqual([]);

    const other = AgentSession.start({ agentId, provider: "claude", workspaceId, machineId });
    await repository.save(other);

    const activeAfter = await repository.listActiveByAgent(agentId);
    expect(activeAfter).toHaveLength(1);
  });

  it("persists status, heartbeat and approval changes on save", async () => {
    const session = AgentSession.start({ agentId, provider: "claude", workspaceId, machineId });
    await repository.save(session);

    session.changeStatus(AgentSessionStatus.RUNNING);
    session.recordHeartbeat();
    await repository.save(session);

    const found = await repository.findById(session.id);
    expect(found?.status).toBe(AgentSessionStatus.RUNNING);
    expect(found?.lastHeartbeatAt).not.toBeNull();
  });
});
