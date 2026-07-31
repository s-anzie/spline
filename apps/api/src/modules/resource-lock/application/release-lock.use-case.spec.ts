import { LockResourceType, WorkspaceRole } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { PermissionsService } from "../../identity/application/permissions.service";
import { InMemoryWorkspaceMembershipRepository } from "../../identity/application/testing/in-memory-workspace-membership.repository";
import { WorkspaceMembership } from "../../identity/domain/workspace-membership";
import { ResourceLock } from "../domain/resource-lock";
import { NotLockOwnerError } from "../domain/resource-lock.errors";
import { LockNotFoundError } from "./resource-lock-application.errors";
import { ReleaseLockUseCase } from "./release-lock.use-case";
import { InMemoryResourceLockRepository } from "./testing/in-memory-resource-lock.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

function setup() {
  const locks = new InMemoryResourceLockRepository();
  const memberships = new InMemoryWorkspaceMembershipRepository();
  const permissionsService = new PermissionsService(memberships);
  const clock = new FakeClock(NOW);
  const eventPublisher = new FakeEventPublisher();
  const useCase = new ReleaseLockUseCase(locks, permissionsService, clock, eventPublisher);
  return { locks, memberships, useCase };
}

function createLock(workspaceId = "w1") {
  return ResourceLock.acquire({
    workspaceId,
    resourceType: LockResourceType.PROCESS,
    resourceId: "process-1",
    lockedBy: HUMAN_1,
  });
}

describe("ReleaseLockUseCase", () => {
  it("releases a lock for its owner", async () => {
    const { locks, useCase } = setup();
    const lock = createLock();
    await locks.save(lock);

    const result = await useCase.execute({ lockId: lock.id.toString(), releasedBy: HUMAN_1 });

    expect(result.isSuccess).toBe(true);
    expect(result.value.isReleased).toBe(true);
  });

  it("fails when the lock does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ lockId: "unknown", releasedBy: HUMAN_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(LockNotFoundError);
  });

  it("rejects release by a non-owner without manage_workspace_rules", async () => {
    const { locks, useCase } = setup();
    const lock = createLock();
    await locks.save(lock);

    const result = await useCase.execute({ lockId: lock.id.toString(), releasedBy: AGENT_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(NotLockOwnerError);
  });

  it("force-releases on behalf of a non-owner who holds manage_workspace_rules", async () => {
    const { locks, memberships, useCase } = setup();
    const lock = createLock("w1");
    await locks.save(lock);
    await memberships.save(
      WorkspaceMembership.create({ workspaceId: "w1", actorType: "HUMAN", actorId: "owner-1", role: WorkspaceRole.OWNER }),
    );

    const result = await useCase.execute({
      lockId: lock.id.toString(),
      releasedBy: { type: "HUMAN", id: "owner-1" },
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.isReleased).toBe(true);
  });
});
