import { LockResourceType } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { ResourceLock } from "../domain/resource-lock";
import { IsResourceLockedByActorUseCase } from "./is-resource-locked-by-actor.use-case";
import { InMemoryResourceLockRepository } from "./testing/in-memory-resource-lock.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

describe("IsResourceLockedByActorUseCase", () => {
  it("is true when the actor holds an active lock on the resource", async () => {
    const locks = new InMemoryResourceLockRepository();
    await locks.save(
      ResourceLock.acquire({
        workspaceId: "w1",
        resourceType: LockResourceType.PROCESS,
        resourceId: "process-1",
        lockedBy: HUMAN_1,
      }),
    );
    const useCase = new IsResourceLockedByActorUseCase(locks, new FakeClock(NOW));

    const result = await useCase.execute({
      workspaceId: "w1",
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      actor: HUMAN_1,
    });

    expect(result).toBe(true);
  });

  it("is false when a different actor holds the lock", async () => {
    const locks = new InMemoryResourceLockRepository();
    await locks.save(
      ResourceLock.acquire({
        workspaceId: "w1",
        resourceType: LockResourceType.PROCESS,
        resourceId: "process-1",
        lockedBy: HUMAN_1,
      }),
    );
    const useCase = new IsResourceLockedByActorUseCase(locks, new FakeClock(NOW));

    const result = await useCase.execute({
      workspaceId: "w1",
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      actor: AGENT_1,
    });

    expect(result).toBe(false);
  });

  it("is false when there is no lock at all", async () => {
    const locks = new InMemoryResourceLockRepository();
    const useCase = new IsResourceLockedByActorUseCase(locks, new FakeClock(NOW));

    const result = await useCase.execute({
      workspaceId: "w1",
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      actor: HUMAN_1,
    });

    expect(result).toBe(false);
  });

  it("is false when the lock has expired", async () => {
    const locks = new InMemoryResourceLockRepository();
    const clock = new FakeClock(NOW);
    await locks.save(
      ResourceLock.acquire(
        {
          workspaceId: "w1",
          resourceType: LockResourceType.PROCESS,
          resourceId: "process-1",
          expiresAt: new Date("2026-07-31T10:05:00Z"),
          lockedBy: HUMAN_1,
        },
        NOW,
      ),
    );
    clock.set(new Date("2026-07-31T10:05:01Z"));
    const useCase = new IsResourceLockedByActorUseCase(locks, clock);

    const result = await useCase.execute({
      workspaceId: "w1",
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      actor: HUMAN_1,
    });

    expect(result).toBe(false);
  });
});
