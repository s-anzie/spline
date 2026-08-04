import { SystemClock } from "./system-clock";

describe("SystemClock", () => {
  it("returns the current time", () => {
    const clock = new SystemClock();
    const before = Date.now();

    const now = clock.now();

    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it("returns a fresh Date on each call", () => {
    const clock = new SystemClock();

    expect(clock.now()).not.toBe(clock.now());
  });
});
