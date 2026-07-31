import { SandboxModel } from "@repo/db";

import { PrismaProviderProfileRepository } from "../../src/modules/agent/infrastructure/prisma-provider-profile.repository";
import { ProviderProfile } from "../../src/modules/agent/domain/provider-profile";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";

describe("PrismaProviderProfileRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaProviderProfileRepository;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaProviderProfileRepository(prisma);
  });

  beforeEach(async () => {
    // provider_profiles is deliberately excluded from resetDatabase() (it's
    // a seeded catalog, not per-test domain data) — other e2e spec files
    // bootstrapping AgentModule seed "claude"/"codex" via onModuleInit and
    // never clean up after themselves, so this file must clear the table
    // itself before each test rather than assuming a pristine table.
    await prisma.providerProfile.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a provider profile and finds it back by id and by provider", async () => {
    const profile = ProviderProfile.create({ provider: "claude", capabilities: ["code_edit"] });

    await repository.save(profile);

    const foundById = await repository.findById(profile.id);
    const foundByProvider = await repository.findByProvider("claude");
    expect(foundById?.provider).toBe("claude");
    expect(foundByProvider?.capabilities).toEqual(["code_edit"]);
  });

  it("returns null for an unknown id or provider", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
    await expect(repository.findByProvider("unknown")).resolves.toBeNull();
  });

  it("lists every profile", async () => {
    await repository.save(ProviderProfile.create({ provider: "claude" }));
    await repository.save(ProviderProfile.create({ provider: "codex" }));

    const found = await repository.list();

    expect(found.map((p) => p.provider).sort()).toEqual(["claude", "codex"]);
  });

  it("persists config updates on save", async () => {
    const profile = ProviderProfile.create({ provider: "claude" });
    await repository.save(profile);

    profile.updateConfig({ sandboxModel: SandboxModel.FULL_ACCESS, approvalRules: { autoApprove: true } });
    await repository.save(profile);

    const found = await repository.findById(profile.id);
    expect(found?.sandboxModel).toBe(SandboxModel.FULL_ACCESS);
    expect(found?.approvalRules).toEqual({ autoApprove: true });
  });
});
