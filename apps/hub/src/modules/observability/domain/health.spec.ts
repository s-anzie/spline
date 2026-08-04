import { HealthSignal, Rollup, worstOf, WorkspaceHealth } from "./health";

const now = new Date("2026-08-04T12:00:00Z");
const anHourAgo = new Date("2026-08-04T11:00:00Z");
const yesterday = new Date("2026-08-03T12:00:00Z");

describe("Rollup", () => {
  /**
   * §17.8 is the only section of the chapter quoting a production
   * observation: "21 commandes runtime bloquées" without knowing which ones
   * is an alert nobody can act on. Treating that as a writing guideline
   * invites forgetting it; the count is derived so it cannot be published
   * alone, and cannot disagree with its own detail.
   */
  it("derives its count from its detail, so the two can never disagree", () => {
    const rollup = Rollup.of([
      { id: "l-1", type: "lock", since: anHourAgo },
      { id: "l-2", type: "lock", since: yesterday },
    ]);

    expect(rollup.count).toBe(2);
    expect(rollup.items).toHaveLength(2);
  });

  it("offers no way to state a count at all", () => {
    const constructors = Object.getOwnPropertyNames(Rollup).filter(
      (name) => typeof (Rollup as unknown as Record<string, unknown>)[name] === "function",
    );

    // `of` is the only door in, and it takes items.
    expect(constructors).toEqual(["of"]);
  });

  it("is empty rather than absent when nothing is degraded", () => {
    const rollup = Rollup.of([]);

    expect(rollup.count).toBe(0);
    expect(rollup.isEmpty).toBe(true);
  });

  /** "Depuis quand" is part of what §17.8 asks to report. */
  it("puts the longest-degraded first, because that is what to look at", () => {
    const rollup = Rollup.of([
      { id: "recent", type: "task", since: anHourAgo },
      { id: "old", type: "task", since: yesterday },
    ]);

    expect(rollup.items[0]?.id).toBe("old");
  });

  it("reports how long each resource has been degraded", () => {
    const rollup = Rollup.of([{ id: "l-1", type: "lock", since: anHourAgo }]);

    expect(rollup.ageMsAt(now)[0]).toBe(60 * 60 * 1000);
  });
});

describe("HealthSignal", () => {
  it("says which threshold was applied and where it came from", () => {
    const signal = HealthSignal.from({
      probe: "locks",
      rollup: Rollup.of([{ id: "l-1", type: "lock", since: yesterday }]),
      thresholdMs: 300000,
      thresholdSource: "policy",
      degradedAt: 1,
      unhealthyAt: 10,
    });

    // §17.8 again: a reported state never omits what produced it.
    expect(signal.thresholdMs).toBe(300000);
    expect(signal.thresholdSource).toBe("policy");
  });

  it("is healthy when nothing is degraded", () => {
    const signal = HealthSignal.from({
      probe: "locks",
      rollup: Rollup.of([]),
      thresholdMs: 1000,
      thresholdSource: "default",
      degradedAt: 1,
      unhealthyAt: 10,
    });

    expect(signal.level).toBe("HEALTHY");
  });

  it("climbs from warning to degraded to unhealthy as the list grows", () => {
    const at = (count: number) =>
      HealthSignal.from({
        probe: "locks",
        rollup: Rollup.of(
          Array.from({ length: count }, (_, i) => ({
            id: `l-${i}`,
            type: "lock",
            since: yesterday,
          })),
        ),
        thresholdMs: 1000,
        thresholdSource: "default",
        degradedAt: 3,
        unhealthyAt: 10,
      }).level;

    expect(at(0)).toBe("HEALTHY");
    expect(at(1)).toBe("WARNING");
    expect(at(3)).toBe("DEGRADED");
    expect(at(10)).toBe("UNHEALTHY");
    expect(at(50)).toBe("UNHEALTHY");
  });

  /** Some signals are not a matter of degree: the chain is intact or it is not. */
  it("can be declared outright, for a condition that has no scale", () => {
    const broken = HealthSignal.critical({
      probe: "audit",
      rollup: Rollup.of([{ id: "a-7", type: "audit_entry", since: yesterday }]),
      reason: "the signature chain is broken",
    });

    expect(broken.level).toBe("UNHEALTHY");
    expect(broken.reason).toBe("the signature chain is broken");
  });
});

describe("WorkspaceHealth", () => {
  const signal = (probe: string, count: number) =>
    HealthSignal.from({
      probe,
      rollup: Rollup.of(
        Array.from({ length: count }, (_, i) => ({
          id: `${probe}-${i}`,
          type: probe,
          since: yesterday,
        })),
      ),
      thresholdMs: 1000,
      thresholdSource: "default",
      degradedAt: 3,
      unhealthyAt: 10,
    });

  /** A system is not "healthy on average". */
  it("takes the worst signal, never the average", () => {
    const health = WorkspaceHealth.of("w-1", [
      signal("locks", 0),
      signal("tasks", 12),
      signal("validations", 1),
    ]);

    expect(health.level).toBe("UNHEALTHY");
  });

  it("is healthy only when every signal is", () => {
    expect(WorkspaceHealth.of("w-1", [signal("a", 0), signal("b", 0)]).level).toBe(
      "HEALTHY",
    );
  });

  it("is healthy when there is nothing to probe yet", () => {
    expect(WorkspaceHealth.of("w-1", []).level).toBe("HEALTHY");
  });

  /** The overview AND the detail, never one without the other (§17.8). */
  it("keeps every signal's detail alongside the overall level", () => {
    const health = WorkspaceHealth.of("w-1", [signal("locks", 2), signal("tasks", 0)]);

    expect(health.signals).toHaveLength(2);
    expect(health.totalDegraded).toBe(2);
    expect(health.signals[0]?.rollup.items[0]?.id).toBe("locks-0");
  });
});

describe("worstOf", () => {
  it("orders the four levels of §17.6", () => {
    expect(worstOf(["HEALTHY", "WARNING"])).toBe("WARNING");
    expect(worstOf(["WARNING", "DEGRADED"])).toBe("DEGRADED");
    expect(worstOf(["DEGRADED", "UNHEALTHY"])).toBe("UNHEALTHY");
    expect(worstOf(["UNHEALTHY", "HEALTHY"])).toBe("UNHEALTHY");
    expect(worstOf([])).toBe("HEALTHY");
  });
});
