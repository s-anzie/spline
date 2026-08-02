import { Priority, TaskStatus } from "@repo/db";

import { PrismaTaskRepository } from "../../src/modules/task/infrastructure/prisma-task.repository";
import { Task } from "../../src/modules/task/domain/task";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaTaskRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaTaskRepository;
  let workspaceId: string;
  let goalId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaTaskRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
    const goal = await prisma.goal.create({
      data: { workspaceId, title: "Goal", ownerType: "HUMAN", ownerId: "user-1" },
    });
    goalId = goal.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a task and finds it back by id", async () => {
    const task = Task.create({
      workspaceId,
      goalId,
      title: "Write the login endpoint",
      priority: Priority.HIGH,
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    await repository.save(task);
    const found = await repository.findById(task.id);

    expect(found?.title).toBe("Write the login endpoint");
    expect(found?.goalId).toBe(goalId);
    expect(found?.priority).toBe(Priority.HIGH);
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("finds several tasks by id in one call", async () => {
    const a = Task.create({ workspaceId, title: "A", createdByType: "HUMAN", createdById: "u1" });
    const b = Task.create({ workspaceId, title: "B", createdByType: "HUMAN", createdById: "u1" });
    await repository.save(a);
    await repository.save(b);

    const found = await repository.findByIds([a.id.toString(), b.id.toString()]);

    expect(found.map((t) => t.title).sort()).toEqual(["A", "B"]);
  });

  it("lists tasks by workspace, optionally filtered by goal", async () => {
    await repository.save(
      Task.create({ workspaceId, goalId, title: "With goal", createdByType: "HUMAN", createdById: "u1" }),
    );
    await repository.save(
      Task.create({ workspaceId, title: "No goal", createdByType: "HUMAN", createdById: "u1" }),
    );

    const all = await repository.listByWorkspace(workspaceId);
    const onlyWithGoal = await repository.listByWorkspace(workspaceId, goalId);

    expect(all).toHaveLength(2);
    expect(onlyWithGoal.map((t) => t.title)).toEqual(["With goal"]);
  });

  it("lists tasks by goal", async () => {
    await repository.save(
      Task.create({ workspaceId, goalId, title: "With goal", createdByType: "HUMAN", createdById: "u1" }),
    );

    const found = await repository.listByGoal(goalId);

    expect(found.map((t) => t.title)).toEqual(["With goal"]);
  });

  it("persists status, assignment and dependency changes on save", async () => {
    const dependency = Task.create({ workspaceId, title: "Dep", createdByType: "HUMAN", createdById: "u1" });
    await repository.save(dependency);

    const task = Task.create({ workspaceId, title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    await repository.save(task);

    const actor = { type: "HUMAN" as const, id: "user-1" };
    task.updateDetails({ dependencies: [dependency.id.toString()] }, actor);
    task.assign("AGENT", "agent-1", actor);
    task.changeStatus(TaskStatus.TODO, actor);
    await repository.save(task);

    const found = await repository.findById(task.id);
    expect(found?.status).toBe(TaskStatus.TODO);
    expect(found?.assigneeId).toBe("agent-1");
    expect(found?.dependencies).toEqual([dependency.id.toString()]);
    expect(found?.updatedByType).toBe("HUMAN");
    expect(found?.updatedById).toBe("user-1");
  });

  it("persists a goalId change (linking an orphan task) on save", async () => {
    const task = Task.create({ workspaceId, title: "Orphan task", createdByType: "HUMAN", createdById: "u1" });
    await repository.save(task);

    task.linkToGoal(goalId, { type: "HUMAN", id: "user-1" });
    await repository.save(task);

    const found = await repository.findById(task.id);
    expect(found?.goalId).toBe(goalId);
  });
});
