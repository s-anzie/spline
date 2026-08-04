import { ReactionDepth, ReactionLoopError } from "./reaction-depth";

describe("ReactionDepth", () => {
  it("lets an ordinary chain of reactions through", async () => {
    const depth = new ReactionDepth(5);
    const seen: number[] = [];

    await depth.within("a.happened", async () => {
      seen.push(depth.current);
      await depth.within("b.happened", async () => {
        seen.push(depth.current);
      });
    });

    expect(seen).toEqual([1, 2]);
    expect(depth.current).toBe(0);
  });

  /**
   * The concrete hazard, and the reason this exists: publication is now
   * awaited (§14 publisher), so a listener that publishes what it listens to
   * no longer floats — it recurses inside the caller's stack and the request
   * never returns. OpenClaw bounds the equivalent at five turns
   * (`maxPingPongTurns`); a bound is what makes the failure loud and finite.
   */
  it("stops a reaction chain that feeds itself", async () => {
    const depth = new ReactionDepth(3);

    const runaway = async (): Promise<void> => {
      await depth.within("task.updated", runaway);
    };

    await expect(runaway()).rejects.toBeInstanceOf(ReactionLoopError);
  });

  it("names the chain it refused, so the culprit is readable", async () => {
    const depth = new ReactionDepth(2);

    const caught: unknown = await depth
      .within("goal.cancelled", () =>
        depth.within("task.cancelled", () => depth.within("goal.cancelled", async () => {})),
      )
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ReactionLoopError);
    expect((caught as ReactionLoopError).message).toContain("goal.cancelled");
    expect((caught as ReactionLoopError).message).toContain("task.cancelled");
  });

  it("unwinds cleanly after a refusal, so the next request starts fresh", async () => {
    const depth = new ReactionDepth(1);

    await depth.within("a", () => depth.within("b", async () => {})).catch(() => undefined);

    expect(depth.current).toBe(0);
  });

  it("unwinds when a listener throws for its own reasons", async () => {
    const depth = new ReactionDepth(5);

    await depth
      .within("a", () => Promise.reject(new Error("listener blew up")))
      .catch(() => undefined);

    expect(depth.current).toBe(0);
  });
});
