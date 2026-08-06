import { RefreshSession } from "./refresh-session";

/**
 * §18 — a session that outlives the tab.
 *
 * The access token is short-lived and held in memory; this is what lets a
 * browser get a new one without asking for the password again. It is a
 * long-lived credential in a cookie, so the rules around it are the whole
 * point of the entity:
 *
 * - it can be redeemed exactly once,
 * - a second redemption of the same one is not a mistake, it is a THEFT
 *   signal — the legitimate holder rotated, so whoever presents the old one
 *   copied it,
 * - and the answer to that signal is to kill the whole chain, not just the
 *   token presented, because the thief already holds the successor.
 */
describe("RefreshSession", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");
  const TTL = 30 * 24 * 60 * 60 * 1000;

  const open = () =>
    RefreshSession.open({
      userId: "user-1",
      tokenHash: "hash-1",
      now,
      lifetimeMs: TTL,
    });

  it("opens a chain of its own", () => {
    const session = open();
    expect(session.isSuccess).toBe(true);
    const value = session.value;
    expect(value.userId).toBe("user-1");
    // The chain is named by the first link, so a rotation can revoke every
    // link at once without walking a list.
    expect(value.familyId).toBe(value.id.value);
    expect(value.expiresAt.getTime()).toBe(now.getTime() + TTL);
    expect(value.usedAt).toBeNull();
    expect(value.revokedAt).toBeNull();
  });

  it("refuses a lifetime that is not a lifetime", () => {
    const bad = RefreshSession.open({
      userId: "user-1",
      tokenHash: "hash-1",
      now,
      lifetimeMs: 0,
    });
    expect(bad.isFailure).toBe(true);
  });

  it("can be redeemed once, and says so", () => {
    const session = open().value;
    expect(session.redeemableAt(now).isSuccess).toBe(true);

    const next = session.rotate({ tokenHash: "hash-2", now, lifetimeMs: TTL });
    expect(next.isSuccess).toBe(true);
    expect(session.usedAt).toEqual(now);
    // Same chain, new link.
    expect(next.value.familyId).toBe(session.familyId);
    expect(next.value.id.value).not.toBe(session.id.value);
    expect(next.value.userId).toBe("user-1");
  });

  it("treats a second redemption as theft, not as a mistake", () => {
    const session = open().value;
    session.rotate({ tokenHash: "hash-2", now, lifetimeMs: TTL });

    const replayed = session.redeemableAt(now);
    expect(replayed.isFailure).toBe(true);
    expect(replayed.error.name).toBe("SessionReplayedError");
    // Naming it is what lets the caller revoke the whole chain rather than
    // just refusing this one request.
    expect(session.rotate({ tokenHash: "hash-3", now, lifetimeMs: TTL }).isFailure).toBe(
      true,
    );
  });

  it("expires, and an expired one cannot be rotated", () => {
    const session = open().value;
    const later = new Date(now.getTime() + TTL + 1);
    expect(session.redeemableAt(later).isFailure).toBe(true);
    expect(session.redeemableAt(later).error.name).toBe("SessionExpiredError");
    expect(session.rotate({ tokenHash: "x", now: later, lifetimeMs: TTL }).isFailure).toBe(
      true,
    );
  });

  it("is dead once revoked, whatever the clock says", () => {
    const session = open().value;
    session.revoke(now);
    expect(session.revokedAt).toEqual(now);
    expect(session.redeemableAt(now).isFailure).toBe(true);
    expect(session.redeemableAt(now).error.name).toBe("SessionRevokedError");
  });

  it("does not un-revoke, and does not move a first use", () => {
    const session = open().value;
    session.rotate({ tokenHash: "hash-2", now, lifetimeMs: TTL });
    const firstUse = session.usedAt;
    session.revoke(now);
    const later = new Date(now.getTime() + 60_000);
    session.revoke(later);
    // The record of WHEN is evidence; overwriting it would erase the trace of
    // the rotation that mattered.
    expect(session.revokedAt).toEqual(now);
    expect(session.usedAt).toEqual(firstUse);
  });
});
