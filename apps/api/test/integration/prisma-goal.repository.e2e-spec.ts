import { GoalStatus, Priority } from "@repo/db";

import { PrismaGoalRepository } from "../../src/modules/goal/infrastructure/prisma-goal.repository";
import { Goal } from "../../src/modules/goal/domain/goal";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaGoalRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaGoalRepository;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaGoalRepository(prisma);
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

  it("persists a goal and finds it back by id", async () => {
    const goal = Goal.create({
      workspaceId,
      title: "Ship the MVP",
      priority: Priority.HIGH,
      ownerType: "HUMAN",
      ownerId: "user-1",
      successCriteria: ["criteria a"],
    });

    await repository.save(goal);
    const found = await repository.findById(goal.id);

    expect(found?.title).toBe("Ship the MVP");
    expect(found?.priority).toBe(Priority.HIGH);
    expect(found?.successCriteria).toEqual(["criteria a"]);
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists only the goals of the given workspace", async () => {
    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other" } });
    await repository.save(
      Goal.create({ workspaceId, title: "A", ownerType: "HUMAN", ownerId: "u1" }),
    );
    await repository.save(
      Goal.create({ workspaceId: otherWorkspace.id, title: "B", ownerType: "HUMAN", ownerId: "u1" }),
    );

    const found = await repository.listByWorkspace(workspaceId);

    expect(found.map((g) => g.title)).toEqual(["A"]);
  });

  it("persists status and progress changes on save", async () => {
    const goal = Goal.create({ workspaceId, title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await repository.save(goal);

    goal.changeStatus(GoalStatus.ACTIVE);
    goal.recalculateProgress(2, 4);
    await repository.save(goal);

    const found = await repository.findById(goal.id);
    expect(found?.status).toBe(GoalStatus.ACTIVE);
    expect(found?.progressPercentage).toBe(50);
  });
});
