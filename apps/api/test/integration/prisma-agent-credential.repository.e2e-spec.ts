import { PrismaAgentCredentialRepository } from "../../src/modules/identity/infrastructure/prisma-agent-credential.repository";
import { AgentCredential } from "../../src/modules/identity/domain/agent-credential";
import { PrismaService } from "../../src/prisma/prisma.service";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaAgentCredentialRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaAgentCredentialRepository;
  let agentId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaAgentCredentialRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    const agent = await prisma.agent.create({
      data: { workspaceId: workspace.id, provider: "claude-code", displayName: "Agent 1" },
    });
    agentId = agent.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a credential and finds it back by id and by agent id", async () => {
    const credential = AgentCredential.create({ agentId, tokenHash: "hash" });

    await repository.save(credential);

    await expect(repository.findById(credential.id)).resolves.not.toBeNull();
    const byAgent = await repository.findByAgentId(agentId);
    expect(byAgent?.tokenHash).toBe("hash");
  });

  it("persists revocation", async () => {
    const credential = AgentCredential.create({ agentId, tokenHash: "hash" });
    await repository.save(credential);

    credential.revoke(new Date());
    await repository.save(credential);

    const found = await repository.findById(credential.id);
    expect(found?.isActive()).toBe(false);
  });
});
