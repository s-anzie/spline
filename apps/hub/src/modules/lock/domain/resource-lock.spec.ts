import { ActorRef } from "../../identity/domain/actor";
import { ResourceLock } from "./resource-lock";

const now = new Date("2026-08-04T10:00:00Z");
const inFiveMinutes = new Date("2026-08-04T10:05:00Z");
const inOneHour = new Date("2026-08-04T11:00:00Z");

/**
 * §13.7 is emphatic that a conflict test using the same actor on both sides
 * proves nothing. Two distinct actors, named as such, so no future edit can
 * quietly collapse them into one.
 */
const holder = ActorRef.create("AGENT", "a-holder").value;
const challenger = ActorRef.create("AGENT", "a-challenger").value;

function acquired(overrides: Record<string, unknown> = {}) {
  return ResourceLock.acquire({
    workspaceId: "w-1",
    resourceType: "port",
    resourceId: "5433",
    owner: holder,
    reason: "running the integration suite",
    ttlMs: 5 * 60 * 1000,
    now,
    ...overrides,
  });
}

describe("ResourceLock", () => {
  it("protects one precise resource, for a bounded time", () => {
    const result = acquired();

    expect(result.isSuccess).toBe(true);
    const lock = result.value;
    expect(lock.resourceType).toBe("port");
    expect(lock.resourceId).toBe("5433");
    expect(lock.owner.actorId).toBe("a-holder");
    expect(lock.status).toBe("HELD");
    // §13: locks "possèdent toujours une durée de vie".
    expect(lock.expiresAt).toEqual(inFiveMinutes);
  });

  it("refuses a lock with no resource, no reason, or no lifetime", () => {
    expect(acquired({ resourceType: " " }).isFailure).toBe(true);
    expect(acquired({ resourceId: "" }).isFailure).toBe(true);
    expect(acquired({ reason: "  " }).isFailure).toBe(true);
    expect(acquired({ ttlMs: 0 }).isFailure).toBe(true);
    expect(acquired({ ttlMs: -1 }).isFailure).toBe(true);
  });

  /** §13.5 — automatic, never permanent. */
  it("stops holding anything the instant its lease expires", () => {
    const lock = acquired().value;

    expect(lock.isActiveAt(new Date("2026-08-04T10:04:59Z"))).toBe(true);
    expect(lock.isActiveAt(inFiveMinutes)).toBe(false);
    expect(lock.isActiveAt(inOneHour)).toBe(false);
  });

  it("can be renewed by pushing the deadline out", () => {
    const lock = acquired().value;

    const renewed = lock.renew(60 * 60 * 1000, new Date("2026-08-04T10:04:00Z"));

    expect(renewed.isSuccess).toBe(true);
    expect(lock.expiresAt).toEqual(new Date("2026-08-04T11:04:00Z"));
  });

  it("cannot be renewed once its lease has already run out", () => {
    const lock = acquired().value;

    const renewed = lock.renew(60 * 1000, inOneHour);

    expect(renewed.isFailure).toBe(true);
    expect(renewed.error.name).toBe("LockNotHeldError");
  });

  it("is released, not deleted — what governed the past stays readable", () => {
    const lock = acquired().value;

    expect(lock.release(inFiveMinutes).isSuccess).toBe(true);
    expect(lock.status).toBe("RELEASED");
    expect(lock.releasedAt).toEqual(inFiveMinutes);
    expect(lock.isActiveAt(inFiveMinutes)).toBe(false);
  });

  it("is idempotent on release", () => {
    const lock = acquired().value;
    lock.release(now);

    expect(lock.release(inFiveMinutes).isSuccess).toBe(true);
    expect(lock.releasedAt).toEqual(now);
  });

  it("marks an expired lease as such once, for the record", () => {
    const lock = acquired().value;

    expect(lock.expire(inOneHour).isSuccess).toBe(true);
    expect(lock.status).toBe("EXPIRED");
    // §17.9 — "Lease Expired" is an alert; the holder has to be told.
    expect(lock.domainEvents.at(-1)?.eventName).toBe("lock.lease_expired");
  });

  it("will not expire a lock that is still perfectly valid", () => {
    const lock = acquired().value;

    expect(lock.expire(new Date("2026-08-04T10:01:00Z")).isFailure).toBe(true);
    expect(lock.status).toBe("HELD");
  });

  /**
   * §13.7 / §4.16, first of the two paths. Re-acquiring what you already hold
   * succeeds without creating any new state.
   */
  describe("re-acquisition by the same actor — idempotent", () => {
    it("recognises its own holder", () => {
      const lock = acquired().value;

      expect(lock.isHeldBy(holder, now)).toBe(true);
    });

    it("does not recognise the holder once the lease has run out", () => {
      const lock = acquired().value;

      expect(lock.isHeldBy(holder, inOneHour)).toBe(false);
    });
  });

  /**
   * §13.7 / §4.16, second path — the one the earlier codebase left uncovered
   * (0.3.5) by using the same actor on both sides. A DIFFERENT actor.
   */
  describe("acquisition by a different actor — real conflict", () => {
    it("does not mistake a challenger for the holder", () => {
      const lock = acquired().value;

      expect(lock.isHeldBy(challenger, now)).toBe(false);
      expect(lock.owner.equals(challenger)).toBe(false);
    });

    it("stops standing in a challenger's way once the lease expires", () => {
      const lock = acquired().value;

      expect(lock.isActiveAt(now)).toBe(true);
      expect(lock.isActiveAt(inOneHour)).toBe(false);
    });

    it("refuses to be renewed or released by anyone but its holder", () => {
      const lock = acquired().value;

      expect(lock.canBeManagedBy(challenger, now)).toBe(false);
      expect(lock.canBeManagedBy(holder, now)).toBe(true);
    });
  });

  it("raises a fact the journal can read, carrying the workspace", () => {
    const lock = acquired().value;

    expect(lock.domainEvents[0]?.eventName).toBe("lock.acquired");
    expect(lock.domainEvents[0]?.workspaceId).toBe("w-1");
  });
});
