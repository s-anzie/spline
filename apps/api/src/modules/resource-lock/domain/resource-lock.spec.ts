import { LockResourceType } from "@repo/db";

import { ResourceLock } from "./resource-lock";
import {
  EmptyLockResourceIdError,
  InvalidLockExpiryError,
  LockAlreadyReleasedError,
  NotLockOwnerError,
} from "./resource-lock.errors";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };

function acquireLock(at?: Date) {
  return ResourceLock.acquire(
    {
      workspaceId: "w1",
      resourceType: LockResourceType.PROCESS,
      resourceId: "process-1",
      lockedBy: HUMAN_1,
    },
    at,
  );
}

describe("ResourceLock", () => {
  it("acquires a lock with sensible defaults", () => {
    const lock = acquireLock();

    expect(lock.resourceType).toBe(LockResourceType.PROCESS);
    expect(lock.resourceId).toBe("process-1");
    expect(lock.lockedByType).toBe("HUMAN");
    expect(lock.lockedById).toBe("user-1");
    expect(lock.isReleased).toBe(false);
    expect(lock.releasedAt).toBeUndefined();
  });

  it("records a LockAcquired domain event", () => {
    const lock = acquireLock();

    expect(lock.domainEvents.map((e) => e.eventName)).toEqual(["resource_lock.acquired"]);
  });

  it("rejects an empty resource id", () => {
    expect(() =>
      ResourceLock.acquire({
        workspaceId: "w1",
        resourceType: LockResourceType.TASK,
        resourceId: "   ",
        lockedBy: HUMAN_1,
      }),
    ).toThrow(EmptyLockResourceIdError);
  });

  it("rejects an expiry that is not in the future", () => {
    const now = new Date("2026-07-31T10:00:00Z");

    expect(() =>
      ResourceLock.acquire(
        {
          workspaceId: "w1",
          resourceType: LockResourceType.PROCESS,
          resourceId: "process-1",
          expiresAt: now,
          lockedBy: HUMAN_1,
        },
        now,
      ),
    ).toThrow(InvalidLockExpiryError);
  });

  describe("isExpired / isHeld", () => {
    it("is held when there is no expiry", () => {
      const lock = acquireLock();

      expect(lock.isExpired(new Date("2099-01-01"))).toBe(false);
      expect(lock.isHeld(new Date("2099-01-01"))).toBe(true);
    });

    it("is expired once past its expiresAt, and no longer held", () => {
      const now = new Date("2026-07-31T10:00:00Z");
      const lock = ResourceLock.acquire(
        {
          workspaceId: "w1",
          resourceType: LockResourceType.PROCESS,
          resourceId: "process-1",
          expiresAt: new Date("2026-07-31T10:05:00Z"),
          lockedBy: HUMAN_1,
        },
        now,
      );

      expect(lock.isExpired(new Date("2026-07-31T10:04:59Z"))).toBe(false);
      expect(lock.isExpired(new Date("2026-07-31T10:05:00Z"))).toBe(true);
      expect(lock.isHeld(new Date("2026-07-31T10:05:00Z"))).toBe(false);
    });

    it("a released lock is never expired or held", () => {
      const lock = acquireLock();
      lock.release(HUMAN_1);

      expect(lock.isExpired(new Date("2099-01-01"))).toBe(false);
      expect(lock.isHeld(new Date("2099-01-01"))).toBe(false);
    });
  });

  describe("release", () => {
    it("releases the lock for its owner", () => {
      const lock = acquireLock();

      lock.release(HUMAN_1);

      expect(lock.isReleased).toBe(true);
      expect(lock.domainEvents.map((e) => e.eventName)).toEqual([
        "resource_lock.acquired",
        "resource_lock.released",
      ]);
    });

    it("rejects release by a different actor", () => {
      const lock = acquireLock();

      expect(() => lock.release(AGENT_1)).toThrow(NotLockOwnerError);
    });

    it("rejects releasing an already-released lock", () => {
      const lock = acquireLock();
      lock.release(HUMAN_1);

      expect(() => lock.release(HUMAN_1)).toThrow(LockAlreadyReleasedError);
    });
  });

  describe("forceRelease", () => {
    it("releases the lock regardless of who acquired it", () => {
      const lock = acquireLock();

      lock.forceRelease(AGENT_1);

      expect(lock.isReleased).toBe(true);
      expect(lock.domainEvents.map((e) => e.eventName)).toEqual([
        "resource_lock.acquired",
        "resource_lock.force_released",
      ]);
    });

    it("rejects force-releasing an already-released lock", () => {
      const lock = acquireLock();
      lock.forceRelease(AGENT_1);

      expect(() => lock.forceRelease(AGENT_1)).toThrow(LockAlreadyReleasedError);
    });
  });
});
