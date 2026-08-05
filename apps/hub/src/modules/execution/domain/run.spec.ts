import { Run } from "./run";

const now = new Date("2026-08-05T10:00:00.000Z");
const later = new Date("2026-08-05T10:05:00.000Z");

function started(overrides: Record<string, unknown> = {}) {
  return Run.start({
    workspaceId: "w-1",
    taskId: "t-1",
    attemptNumber: 1,
    now,
    ...overrides,
  });
}

describe("Run", () => {
  it("starts pending, with nobody executing it yet (§4.7)", () => {
    const run = started().value;

    expect(run.status).toBe("PENDING");
    expect(run.workerId).toBeNull();
    expect(run.startedAt).toBeNull();
    expect(run.attempts).toEqual([]);
  });

  it("refuses a run that belongs to no task", () => {
    expect(started({ taskId: " " }).isFailure).toBe(true);
  });

  describe("an attempt is what actually ran", () => {
    it("records which provider and model carried it", () => {
      const run = started().value;

      const attempted = run.beginAttempt(
        { workerId: "worker-1", provider: "claude", model: "opus", promptVersion: "v3" },
        now,
      );

      expect(attempted.isSuccess).toBe(true);
      expect(run.status).toBe("RUNNING");
      expect(run.workerId).toBe("worker-1");
      expect(run.startedAt).toEqual(now);
      expect(run.attempts).toHaveLength(1);
      expect(run.attempts[0]).toMatchObject({ number: 1, provider: "claude" });
    });

    it("numbers attempts in order, so statistics have something to count", () => {
      const run = started().value;
      run.beginAttempt({ workerId: "w", provider: "claude" }, now);
      run.finishAttempt({ outcome: "FAILED" }, later);
      run.beginAttempt({ workerId: "w", provider: "claude" }, later);

      expect(run.attempts.map((attempt) => attempt.number)).toEqual([1, 2]);
    });

    it("closes an attempt with what it cost and how long it took", () => {
      const run = started().value;
      run.beginAttempt({ workerId: "w", provider: "claude" }, now);

      run.finishAttempt(
        { outcome: "COMPLETED", tokenUsage: { input: 100, output: 20 }, cost: 0.42 },
        later,
      );

      expect(run.attempts[0]).toMatchObject({
        outcome: "COMPLETED",
        cost: 0.42,
        durationMs: 5 * 60 * 1000,
      });
    });

    it("refuses to close an attempt that was never opened", () => {
      expect(started().value.finishAttempt({ outcome: "FAILED" }, later).isFailure).toBe(
        true,
      );
    });

    it("refuses to open a second attempt while one is still running", () => {
      const run = started().value;
      run.beginAttempt({ workerId: "w", provider: "claude" }, now);

      expect(
        run.beginAttempt({ workerId: "w", provider: "claude" }, later).isFailure,
      ).toBe(true);
    });
  });

  /**
   * §4.8's resume invariant, recorded from a real failure (0.3.11): a Claude
   * session cannot resume a Codex thread. Session ids, context formats and
   * thread identifiers are not interchangeable between providers, so a resume
   * with a different provider is refused BY NAME rather than accepted and
   * failed downstream where nobody can tell why.
   */
  describe("resuming requires the provider that produced it", () => {
    it("allows the provider that ran the last attempt", () => {
      const run = started().value;
      run.beginAttempt({ workerId: "w", provider: "claude" }, now);
      run.finishAttempt({ outcome: "FAILED" }, later);

      expect(run.resumableBy("claude").isSuccess).toBe(true);
    });

    it("refuses a different provider, explicitly", () => {
      const run = started().value;
      run.beginAttempt({ workerId: "w", provider: "claude" }, now);
      run.finishAttempt({ outcome: "FAILED" }, later);

      const resumed = run.resumableBy("codex");

      expect(resumed.isFailure).toBe(true);
      expect(resumed.error.name).toBe("AttemptNotResumableError");
      // The refusal names both, so an operator does not have to guess.
      expect(resumed.error.message).toContain("claude");
      expect(resumed.error.message).toContain("codex");
    });

    it("refuses to resume a run that never attempted anything", () => {
      expect(started().value.resumableBy("claude").isFailure).toBe(true);
    });
  });

  describe("how a run ends", () => {
    it("goes to validating before completed: nothing completes without proof (§11)", () => {
      const run = started().value;
      run.beginAttempt({ workerId: "w", provider: "claude" }, now);
      run.finishAttempt({ outcome: "COMPLETED" }, later);

      expect(run.toValidating(later).isSuccess).toBe(true);
      expect(run.complete(later).isSuccess).toBe(true);
      expect(run.finishedAt).toEqual(later);
    });

    it("refuses to complete straight from running, without validation", () => {
      const run = started().value;
      run.beginAttempt({ workerId: "w", provider: "claude" }, now);

      expect(run.complete(later).isFailure).toBe(true);
    });

    it("can fail from anywhere it is still alive", () => {
      const run = started().value;

      expect(run.fail("the worker never came back", later).isSuccess).toBe(true);
      expect(run.status).toBe("FAILED");
      expect(run.failureReason).toBe("the worker never came back");
    });

    it("refuses to revive a finished run: a retry is a NEW run (§9.12)", () => {
      const run = started().value;
      run.fail("gone", later);

      expect(run.beginAttempt({ workerId: "w", provider: "claude" }, later).isFailure).toBe(
        true,
      );
      expect(run.allowedStatusTargets()).toEqual([]);
    });
  });

  /** §20.6 — the affordances a client renders, before it offers a refusal. */
  it("says which transitions are open from where it stands", () => {
    expect(started().value.allowedStatusTargets()).toEqual(["RUNNING", "FAILED"]);
  });
});
