import { SystemClock } from "./system-clock";

describe("SystemClock", () => {
  it("returns the current date and time", () => {
    const clock = new SystemClock();

    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
