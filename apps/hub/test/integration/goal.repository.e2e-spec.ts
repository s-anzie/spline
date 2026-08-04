import { PrismaClient } from "@repo/db";

import { ActorRef } from "../../src/modules/identity/domain/actor";
import { Goal } from "../../src/modules/goal/domain/goal";
import { PrismaGoalRepository } from "../../src/modules/goal/infrastructure/prisma-goal.repository";
import { PrismaService } from "../../src/prisma/prisma.service";
import { resetDatabase } from "../setup/reset-database";
import { createTestPrismaClient } from "./create-test-prisma-service";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");
const human = ActorRef.create("HUMAN", "u-1").value;

describe("goal repository (integration)", () => {
  let prisma: PrismaClient;
  let goals: PrismaGoalRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    goals = new PrismaGoalRepository(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.organization.create({
      data: { id: "org-1", name: "Org", slug: "org", ownerId: "u-1" },
    });
    await prisma.workspace.create({
      data: { id: "w-1", organizationId: "org-1", name: "W", slug: "w", updatedAt: now },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makeGoal(overrides: Partial<Parameters<typeof Goal.create>[0]> = {}) {
    return Goal.create({
      workspaceId: "w-1",
      title: "Ship it",
      successCriteria: ["c1", "c2"],
      owner: human,
      now,
      ...overrides,
    }).value;
  }

  it("round-trips the aggregate including the criteria JSON array", async () => {
    const goal = makeGoal();

    await goals.save(goal);

    const reloaded = await goals.findById(goal.id.value);
    expect(reloaded?.successCriteria).toEqual(["c1", "c2"]);
    expect(reloaded?.owner.type).toBe("HUMAN");
    expect(reloaded?.status).toBe("PLANNED");
    expect(reloaded?.priority).toBe("NORMAL");
  });

  it("persists the FULL aggregate on update — criteria, priority, status, progress (§5.19)", async () => {
    const goal = makeGoal();
    await goals.save(goal);

    goal.updateDetails({ successCriteria: ["only"], priority: "CRITICAL" }, later);
    goal.changeStatus("ACTIVE", later);
    goal.updateProgress(75, later);
    await goals.save(goal);

    const reloaded = await goals.findById(goal.id.value);
    expect(reloaded?.successCriteria).toEqual(["only"]);
    expect(reloaded?.priority).toBe("CRITICAL");
    expect(reloaded?.status).toBe("ACTIVE");
    expect(reloaded?.progress).toBe(75);
  });

  it("filters by workspace, parent and status", async () => {
    const parent = makeGoal();
    await goals.save(parent);
    const child = makeGoal({ parentGoalId: parent.id.value, title: "child" });
    await goals.save(child);

    expect(await goals.list({ workspaceId: "w-1" })).toHaveLength(2);
    expect(await goals.list({ workspaceId: "w-1", parentGoalId: null })).toHaveLength(1);
    expect(
      await goals.list({ workspaceId: "w-1", parentGoalId: parent.id.value }),
    ).toHaveLength(1);
    expect(
      await goals.list({ workspaceId: "w-1", statuses: ["ACTIVE"] }),
    ).toHaveLength(0);
  });

  it("hasOpenChildren ignores completed and cancelled sub-goals", async () => {
    const parent = makeGoal();
    await goals.save(parent);
    const child = makeGoal({ parentGoalId: parent.id.value });
    await goals.save(child);

    expect(await goals.hasOpenChildren(parent.id.value)).toBe(true);

    child.changeStatus("CANCELLED", later);
    await goals.save(child);

    expect(await goals.hasOpenChildren(parent.id.value)).toBe(false);
  });

  it("persists dependencies across reload (§5.6)", async () => {
    const blocker = makeGoal({ title: "blocker" });
    await goals.save(blocker);
    const dependent = makeGoal({ title: "dependent" });
    dependent.addDependency(blocker.id.value, later);
    await goals.save(dependent);

    const reloaded = await goals.findById(dependent.id.value);
    expect(reloaded?.dependsOnGoalIds).toEqual([blocker.id.value]);

    reloaded!.removeDependency(blocker.id.value, later);
    await goals.save(reloaded!);
    expect((await goals.findById(dependent.id.value))?.dependsOnGoalIds).toEqual([]);
  });

  it("refuses to physically delete a parent that still has children (Restrict)", async () => {
    const parent = makeGoal();
    await goals.save(parent);
    await goals.save(makeGoal({ parentGoalId: parent.id.value }));

    await expect(
      prisma.goal.delete({ where: { id: parent.id.value } }),
    ).rejects.toThrow();
  });

  it("cascades goal removal when the workspace is physically deleted", async () => {
    const goal = makeGoal();
    await goals.save(goal);

    await prisma.workspace.delete({ where: { id: "w-1" } });

    expect(await goals.findById(goal.id.value)).toBeNull();
  });
});
