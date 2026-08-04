import { PrismaClient } from "@repo/db";

import { ActorRef } from "../../src/modules/identity/domain/actor";
import { PrismaTaskRepository } from "../../src/modules/task/infrastructure/prisma-task.repository";
import { Task } from "../../src/modules/task/domain/task";
import { PrismaService } from "../../src/prisma/prisma.service";
import { resetDatabase } from "../setup/reset-database";
import { createTestPrismaClient } from "./create-test-prisma-service";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");
const agent = ActorRef.create("AGENT", "a-1").value;

describe("task repository (integration)", () => {
  let prisma: PrismaClient;
  let tasks: PrismaTaskRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    tasks = new PrismaTaskRepository(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.organization.create({
      data: { id: "org-1", name: "Org", slug: "org", ownerId: "u-1" },
    });
    await prisma.workspace.create({
      data: { id: "w-1", organizationId: "org-1", name: "W", slug: "w", updatedAt: now },
    });
    await prisma.goal.create({
      data: {
        id: "g-1",
        workspaceId: "w-1",
        title: "G",
        successCriteria: ["c"],
        ownerType: "HUMAN",
        ownerId: "u-1",
        updatedAt: now,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makeTask(overrides: Partial<Parameters<typeof Task.create>[0]> = {}) {
    return Task.create({
      workspaceId: "w-1",
      goalId: "g-1",
      title: "Wire it",
      acceptanceCriteria: ["c1"],
      assignee: agent,
      now,
      ...overrides,
    }).value;
  }

  it("round-trips the aggregate with its JSON collections", async () => {
    const task = makeTask({ estimatedCost: 12.5, estimatedDurationMinutes: 30 });

    await tasks.save(task);

    const reloaded = await tasks.findById(task.id.value);
    expect(reloaded?.acceptanceCriteria).toEqual(["c1"]);
    expect(reloaded?.assignee.type).toBe("AGENT");
    expect(reloaded?.estimatedCost).toBe(12.5);
    expect(reloaded?.status).toBe("PLANNED");
    expect(reloaded?.repositoryId).toBeNull();
  });

  it("persists the FULL aggregate — blockers, dependencies, status memory (§5.19)", async () => {
    const task = makeTask();
    await tasks.save(task);

    task.changeStatus("READY", later);
    task.changeStatus("ASSIGNED", later);
    task.changeStatus("RUNNING", later);
    task.addDependency("t-other", later);
    task.reportBlocker(
      { type: "INFRASTRUCTURE", description: "disk full", reportedBy: agent },
      later,
    );
    await tasks.save(task);

    const reloaded = await tasks.findById(task.id.value);
    expect(reloaded?.status).toBe("BLOCKED");
    expect(reloaded?.statusBeforeBlock).toBe("RUNNING");
    expect(reloaded?.dependsOnTaskIds).toEqual(["t-other"]);
    expect(reloaded?.openBlockers).toHaveLength(1);
    expect(reloaded?.openBlockers[0]?.reportedBy.actorId).toBe("a-1");
    expect(reloaded?.openBlockers[0]?.reportedAt).toEqual(later);

    // The reloaded aggregate still resumes correctly — proof the memory survived.
    reloaded!.resolveBlocker(reloaded!.openBlockers[0]!.id, "cleaned", later);
    expect(reloaded!.status).toBe("RUNNING");
  });

  it("filters by goal, status and assignee", async () => {
    const mine = makeTask();
    await tasks.save(mine);
    const other = makeTask({ assignee: ActorRef.create("HUMAN", "u-1").value });
    await tasks.save(other);

    expect(await tasks.list({ workspaceId: "w-1" })).toHaveLength(2);
    expect(await tasks.list({ workspaceId: "w-1", goalId: "g-1" })).toHaveLength(2);
    expect(await tasks.list({ workspaceId: "w-1", assignee: agent })).toHaveLength(1);
    expect(await tasks.list({ workspaceId: "w-1", statuses: ["RUNNING"] })).toHaveLength(0);
  });

  it("tallyByGoal excludes cancelled tasks from the denominator", async () => {
    const done = makeTask();
    for (const status of ["READY", "ASSIGNED", "RUNNING", "VALIDATING"] as const) {
      done.changeStatus(status, later);
    }
    done.complete(later);
    await tasks.save(done);
    const cancelled = makeTask();
    cancelled.changeStatus("CANCELLED", later);
    await tasks.save(cancelled);

    expect(await tasks.tallyByGoal("g-1")).toEqual({ total: 1, completed: 1 });
  });

  it("cascades when the goal is removed — a task has no meaning without it", async () => {
    const task = makeTask();
    await tasks.save(task);

    await prisma.goal.delete({ where: { id: "g-1" } });

    expect(await tasks.findById(task.id.value)).toBeNull();
  });
});
