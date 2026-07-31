import { PrismaWorkspaceRepository } from "../../src/modules/workspace/infrastructure/prisma-workspace.repository";
import { Workspace } from "../../src/modules/workspace/domain/workspace";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaWorkspaceRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaWorkspaceRepository;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaWorkspaceRepository(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a workspace and finds it back by id", async () => {
    const workspace = Workspace.create({
      name: "My Project",
      description: "A test workspace",
      ruleset: { maxConcurrentAgents: 2 },
    });

    await repository.save(workspace);
    const found = await repository.findById(workspace.id);

    expect(found?.name).toBe("My Project");
    expect(found?.description).toBe("A test workspace");
    expect(found?.ruleset).toEqual({ maxConcurrentAgents: 2 });
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("finds several workspaces by id in one call", async () => {
    const a = Workspace.create({ name: "A" });
    const b = Workspace.create({ name: "B" });
    const c = Workspace.create({ name: "C" });
    await repository.save(a);
    await repository.save(b);
    await repository.save(c);

    const found = await repository.findByIds([a.id.toString(), b.id.toString()]);

    expect(found.map((w) => w.name).sort()).toEqual(["A", "B"]);
  });

  it("persists status changes on save (upsert)", async () => {
    const workspace = Workspace.create({ name: "My Project" });
    await repository.save(workspace);

    workspace.archive();
    await repository.save(workspace);

    const found = await repository.findById(workspace.id);
    expect(found?.isArchived).toBe(true);
  });
});
