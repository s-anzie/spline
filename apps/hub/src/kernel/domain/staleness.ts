/**
 * Canonical time-window arithmetic (v3 spec §17.7). Every TTL, lease-expiry
 * and heartbeat-staleness decision goes through these functions — never
 * ad-hoc date math at call sites, where offset/comparison mistakes breed.
 * All inputs are Dates handed down from the injected Clock.
 */

export function ageMs(since: Date, now: Date): number {
  return now.getTime() - since.getTime();
}

/** A deadline is expired from the exact instant it is reached. */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/**
 * A resource that has never been seen is stale by definition; otherwise it
 * is stale once its age reaches the TTL.
 */
export function isStale(
  lastSeenAt: Date | null | undefined,
  ttlMs: number,
  now: Date,
): boolean {
  if (lastSeenAt === null || lastSeenAt === undefined) {
    return true;
  }
  return ageMs(lastSeenAt, now) >= ttlMs;
}
