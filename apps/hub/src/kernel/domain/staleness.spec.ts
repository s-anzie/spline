import { ageMs, isExpired, isStale } from "./staleness";

/**
 * Canonical time-window arithmetic (v3 spec §17.7): every TTL/staleness
 * decision in the system goes through these three functions instead of
 * ad-hoc date math — a class of bug (naive timestamp comparison across
 * timezones/offsets) that was hit for real during v1 operation.
 */
describe("staleness", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");

  describe("ageMs", () => {
    it("returns the elapsed milliseconds", () => {
      expect(ageMs(new Date("2026-08-04T11:59:00.000Z"), now)).toBe(60_000);
    });

    it("is negative for a future date", () => {
      expect(ageMs(new Date("2026-08-04T12:01:00.000Z"), now)).toBe(-60_000);
    });
  });

  describe("isExpired", () => {
    it("false strictly before the deadline", () => {
      expect(isExpired(new Date("2026-08-04T12:00:00.001Z"), now)).toBe(false);
    });

    it("true exactly at the deadline", () => {
      expect(isExpired(new Date("2026-08-04T12:00:00.000Z"), now)).toBe(true);
    });

    it("true after the deadline", () => {
      expect(isExpired(new Date("2026-08-04T11:00:00.000Z"), now)).toBe(true);
    });
  });

  describe("isStale", () => {
    const ttl = 45_000;

    it("a resource never seen is stale", () => {
      expect(isStale(null, ttl, now)).toBe(true);
      expect(isStale(undefined, ttl, now)).toBe(true);
    });

    it("fresh within the TTL", () => {
      expect(isStale(new Date("2026-08-04T11:59:30.000Z"), ttl, now)).toBe(false);
    });

    it("stale exactly at the TTL boundary", () => {
      expect(isStale(new Date("2026-08-04T11:59:15.000Z"), ttl, now)).toBe(true);
    });

    it("stale beyond the TTL", () => {
      expect(isStale(new Date("2026-08-04T10:00:00.000Z"), ttl, now)).toBe(true);
    });
  });
});
