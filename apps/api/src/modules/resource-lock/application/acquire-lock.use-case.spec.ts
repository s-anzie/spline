import { LockResourceType } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { EmptyLockResourceIdError } from "../domain/resource-lock.errors";
import { AcquireLockUseCase } from "./acquire-lock.use-case";
import { ResourceAlreadyLockedError } from "./resource-lock-application.errors";
import { InMemoryResourceLockRepository } from "./testing/in-memory-resource-lock.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

function setup() {
  const locks = new InMemoryResourceLockRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const clock = new FakeClock(NOW);
  const eventPublisher = new FakeEventPublisher();
  const useCase = new AcquireLockUseCase(locks, new GetWorkspaceUseCase(workspaces), clock, eventPublisher);
  return { locks, workspaces, clock, eventPublisher, useCase };
}

describe("AcquireLockUseCase", () => {
  it("acquires a lock in an existing workspace", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.lockedById).toBe("user-1");
  });

  it("publishes LockAcquired", async () => {
    const { workspaces, eventPublisher, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: HUMAN_1,
    });

    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["resource_lock.acquired"]);
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails with a domain validation error (e.g. empty resource id)", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: "   ",
      lockedBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyLockResourceIdError);
  });

  it("fails when the resource is already held by another lock", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: HUMAN_1,
    });

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: AGENT_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ResourceAlreadyLockedError);
  });

  it("returns the existing lock when the same owner retries acquisition", async () => {
    const { workspaces, eventPublisher, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const first = await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.TASK,
      resourceId: "task-1",
      lockedBy: AGENT_1,
    });

    const retry = await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.TASK,
      resourceId: "task-1",
      lockedBy: AGENT_1,
    });

    expect(retry.isSuccess).toBe(true);
    expect(retry.value.id.toString()).toBe(first.value.id.toString());
    expect(eventPublisher.published).toHaveLength(1);
  });

  it("allows acquiring a resource whose previous lock has expired", async () => {
    const { workspaces, clock, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      expiresAt: new Date("2026-07-31T10:05:00Z"),
      lockedBy: HUMAN_1,
    });
    clock.set(new Date("2026-07-31T10:05:01Z"));

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: AGENT_1,
    });

    expect(result.isSuccess).toBe(true);
  });

  it("allows acquiring a resource whose previous lock was released", async () => {
    const { workspaces, locks, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const first = await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: HUMAN_1,
    });
    const lock = await locks.findById(first.value.id);
    lock!.release(HUMAN_1);
    await locks.save(lock!);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: AGENT_1,
    });

    expect(result.isSuccess).toBe(true);
  });
});
