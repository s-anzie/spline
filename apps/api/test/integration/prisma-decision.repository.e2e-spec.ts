import { Decision } from "../../src/modules/decision/domain/decision";
import { PrismaDecisionRepository } from "../../src/modules/decision/infrastructure/prisma-decision.repository";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("PrismaDecisionRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaDecisionRepository;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaDecisionRepository(prisma);
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

  it("persists a decision (including json array fields) and finds it back by id", async () => {
    const decision = Decision.record({
      workspaceId,
      subject: "Which HTTP client to use",
      context: "Needed HTTP/2 support",
      optionsConsidered: ["axios", "node-fetch", "undici"],
      decision: "Use undici",
      decidedBy: HUMAN_1,
      confidence: 0.8,
      references: ["artifact-1"],
    });

    await repository.save(decision);
    const found = await repository.findById(decision.id);

    expect(found?.subject).toBe("Which HTTP client to use");
    expect(found?.optionsConsidered).toEqual(["axios", "node-fetch", "undici"]);
    expect(found?.confidence).toBe(0.8);
    expect(found?.references).toEqual(["artifact-1"]);
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists decisions scoped to a workspace, ordered by decidedAt", async () => {
    const older = Decision.record(
      { workspaceId, subject: "First", decision: "A", decidedBy: HUMAN_1 },
      new Date("2026-07-30T10:00:00Z"),
    );
    const newer = Decision.record(
      { workspaceId, subject: "Second", decision: "B", decidedBy: HUMAN_1 },
      new Date("2026-07-31T10:00:00Z"),
    );
    await repository.save(older);
    await repository.save(newer);

    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other" } });
    await repository.save(Decision.record({ workspaceId: otherWorkspace.id, subject: "Other", decision: "C", decidedBy: HUMAN_1 }));

    const found = await repository.listByWorkspace(workspaceId);

    expect(found.map((d) => d.subject)).toEqual(["First", "Second"]);
  });
});
