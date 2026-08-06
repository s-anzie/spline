import { automationOf, AUTOMATION_DEFAULTS } from "./automation";

/**
 * §9 — the ceiling on work nobody clicked.
 *
 * Read out of the workspace's settings bag, which until now nothing read at
 * all. Every value has a safe reading of nonsense, because this bag is JSON
 * that anybody with `manage_workspace` can put anything into, and the thing
 * it governs spends money on somebody else's account.
 */
describe("automationOf", () => {
  it("is off until somebody turns it on", () => {
    expect(automationOf({}).automatic).toBe(false);
    // Not because automation is bad — because starting to dispatch in a
    // workspace nobody asked about is how a night gets spent unasked.
    expect(automationOf({ automation: {} }).automatic).toBe(false);
  });

  it("uses the announced ceilings when it is on and nothing else is said", () => {
    const limits = automationOf({ automation: { automatic: true } });

    expect(limits.automatic).toBe(true);
    expect(limits.concurrentRuns).toBe(AUTOMATION_DEFAULTS.concurrentRuns);
    expect(limits.runsPerDay).toBe(AUTOMATION_DEFAULTS.runsPerDay);
  });

  it("takes the numbers an operator set", () => {
    const limits = automationOf({
      automation: { automatic: true, concurrentRuns: 8, runsPerDay: 100 },
    });

    expect(limits.concurrentRuns).toBe(8);
    expect(limits.runsPerDay).toBe(100);
  });

  /**
   * The bag is free-form JSON. A string where a number belongs, a negative,
   * a fraction, an absurd number — each has to land somewhere sane, because
   * the alternative is a ceiling of NaN, which compares false against
   * everything and therefore stops nothing.
   */
  it.each([
    ["a string", "12"],
    ["nothing", undefined],
    ["null", null],
    ["a negative", -3],
    ["zero", 0],
    ["a fraction", 2.5],
    ["not a number at all", "soon"],
  ])("falls back to the default when the ceiling is %s", (_label, written) => {
    const limits = automationOf({
      automation: { automatic: true, concurrentRuns: written },
    });

    expect(Number.isInteger(limits.concurrentRuns)).toBe(true);
    expect(limits.concurrentRuns).toBeGreaterThan(0);
  });

  it("refuses a ceiling nobody could have meant", () => {
    const limits = automationOf({
      automation: { automatic: true, concurrentRuns: 10_000, runsPerDay: 1e9 },
    });

    expect(limits.concurrentRuns).toBeLessThanOrEqual(AUTOMATION_DEFAULTS.maxConcurrentRuns);
    expect(limits.runsPerDay).toBeLessThanOrEqual(AUTOMATION_DEFAULTS.maxRunsPerDay);
  });

  it("survives a bag that is not even an object", () => {
    expect(automationOf({ automation: "yes" }).automatic).toBe(false);
    expect(automationOf({ automation: 42 }).automatic).toBe(false);
    expect(automationOf({ automation: null }).automatic).toBe(false);
  });

  /** Only `true` turns it on: "true", 1 and "yes" are somebody's typo. */
  it("is turned on by a boolean and by nothing else", () => {
    expect(automationOf({ automation: { automatic: "true" } }).automatic).toBe(false);
    expect(automationOf({ automation: { automatic: 1 } }).automatic).toBe(false);
    expect(automationOf({ automation: { automatic: true } }).automatic).toBe(true);
  });
});
