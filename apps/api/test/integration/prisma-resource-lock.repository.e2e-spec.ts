import { LockResourceType } from "@repo/db";

import { PrismaResourceLockRepository } from "../../src/modules/resource-lock/infrastructure/prisma-resource-lock.repository";
import { ResourceLock } from "../../src/modules/resource-lock/domain/resource-lock";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("PrismaResourceLockRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaResourceLockRepository;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaResourceLockRepository(prisma);
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

  it("persists a lock and finds it back by id", async () => {
    const lock = ResourceLock.acquire({
      workspaceId,
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      reason: "starting the dev server",
      lockedBy: HUMAN_1,
    });

    await repository.save(lock);
    const found = await repository.findById(lock.id);

    expect(found?.resourceId).toBe("process-1");
    expect(found?.reason).toBe("starting the dev server");
    expect(found?.isReleased).toBe(false);
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists active (not-released) locks for a resource", async () => {
    const lock = ResourceLock.acquire({
      workspaceId,
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: HUMAN_1,
    });
    await repository.save(lock);

    const active = await repository.listActiveByResource(workspaceId, LockResourceType.PROCESS, "process-1");
    expect(active).toHaveLength(1);

    lock.release(HUMAN_1);
    await repository.save(lock);

    const afterRelease = await repository.listActiveByResource(
      workspaceId,
      LockResourceType.PROCESS,
      "process-1",
    );
    expect(afterRelease).toHaveLength(0);
  });

  it("lists locks scoped to a workspace", async () => {
    await repository.save(
      ResourceLock.acquire({
        workspaceId,
        resourceType: LockResourceType.TASK,
        resourceId: "task-1",
        lockedBy: HUMAN_1,
      }),
    );
    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other" } });
    await repository.save(
      ResourceLock.acquire({
        workspaceId: otherWorkspace.id,
        resourceType: LockResourceType.TASK,
        resourceId: "task-2",
        lockedBy: HUMAN_1,
      }),
    );

    const found = await repository.listByWorkspace(workspaceId);

    expect(found.map((l) => l.resourceId)).toEqual(["task-1"]);
  });

  it("persists the release on save", async () => {
    const lock = ResourceLock.acquire({
      workspaceId,
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: HUMAN_1,
    });
    await repository.save(lock);

    lock.release(HUMAN_1);
    await repository.save(lock);

    const found = await repository.findById(lock.id);
    expect(found?.isReleased).toBe(true);
  });
});
