import { PreemptionCandidate, choosePreemptionVictim } from "./preemption";

const now = new Date("2026-08-05T12:00:00.000Z");

function candidate(overrides: Partial<PreemptionCandidate> = {}): PreemptionCandidate {
  return {
    taskId: "t-victim",
    runId: "r-1",
    priority: "LOW",
    startedAt: new Date(now.getTime() - 60_000),
    resumable: true,
    lockReclaimable: true,
    ...overrides,
  };
}

describe("choosePreemptionVictim", () => {
  it("picks a task of lower priority", () => {
    const chosen = choosePreemptionVictim("CRITICAL", [candidate()]);

    expect(chosen.isFailure).toBe(false);
    expect(chosen.value?.taskId).toBe("t-victim");
  });

  describe("what §9.14 forbids interrupting", () => {
    /**
     * Equal priority never preempts. Two CRITICAL tasks that could interrupt
     * each other would take turns stopping one another and neither would ever
     * finish — and nothing in the rule would say which was wrong.
     */
    it("refuses a task of the same priority", () => {
      expect(
        choosePreemptionVictim("CRITICAL", [candidate({ priority: "CRITICAL" })])
          .isFailure,
      ).toBe(true);
    });

    it("refuses a task of higher priority", () => {
      expect(
        choosePreemptionVictim("NORMAL", [candidate({ priority: "HIGH" })]).isFailure,
      ).toBe(true);
    });

    /**
     * §9.14 says "si la reprise possible". Interrupting work that cannot be
     * resumed is not preemption, it is destruction — the interrupted task
     * would have to start over, and the time already spent is simply gone.
     */
    it("refuses a task whose work could not be resumed", () => {
      const refused = choosePreemptionVictim("CRITICAL", [
        candidate({ resumable: false }),
      ]);

      expect(refused.isFailure).toBe(true);
      expect(refused.error?.message).toMatch(/resum/i);
    });

    /** §9.14's other condition: "si le Lease est récupérable". */
    it("refuses a task whose lease cannot be reclaimed", () => {
      expect(
        choosePreemptionVictim("CRITICAL", [candidate({ lockReclaimable: false })])
          .isFailure,
      ).toBe(true);
    });

    it("refuses when there is nothing running at all", () => {
      expect(choosePreemptionVictim("CRITICAL", []).isFailure).toBe(true);
    });
  });

  /**
   * §10.18d — a written precedence, replayable, never a weighted heuristic
   * whose output nobody can predict. Each rule below is one line of that
   * order, and the tests are what keeps it written.
   */
  describe("the precedence, in order", () => {
    it("takes the least urgent first", () => {
      const chosen = choosePreemptionVictim("CRITICAL", [
        candidate({ taskId: "t-normal", priority: "NORMAL" }),
        candidate({ taskId: "t-background", priority: "BACKGROUND" }),
        candidate({ taskId: "t-low", priority: "LOW" }),
      ]);

      expect(chosen.value?.taskId).toBe("t-background");
    });

    /**
     * Among equals, the one that started most recently: it has the least
     * work invested, so interrupting it loses the least. The opposite rule —
     * take the oldest — would stop the task closest to finishing.
     */
    it("among equals, takes the one with the least invested", () => {
      const chosen = choosePreemptionVictim("CRITICAL", [
        candidate({
          taskId: "t-old",
          startedAt: new Date(now.getTime() - 600_000),
        }),
        candidate({
          taskId: "t-young",
          startedAt: new Date(now.getTime() - 5_000),
        }),
      ]);

      expect(chosen.value?.taskId).toBe("t-young");
    });

    /**
     * A tie broken by id rather than by arrival: the same inputs must give
     * the same answer on a replay, and list order is not an input anyone
     * controls.
     */
    it("breaks a remaining tie by id, so the answer is replayable", () => {
      const started = new Date(now.getTime() - 5_000);
      const forwards = choosePreemptionVictim("CRITICAL", [
        candidate({ taskId: "t-b", startedAt: started }),
        candidate({ taskId: "t-a", startedAt: started }),
      ]);
      const backwards = choosePreemptionVictim("CRITICAL", [
        candidate({ taskId: "t-a", startedAt: started }),
        candidate({ taskId: "t-b", startedAt: started }),
      ]);

      expect(forwards.value?.taskId).toBe("t-a");
      expect(backwards.value?.taskId).toBe(forwards.value?.taskId);
    });

    it("never lets an ineligible task win on order alone", () => {
      const chosen = choosePreemptionVictim("CRITICAL", [
        // Least urgent, but unresumable: eligibility comes before precedence.
        candidate({ taskId: "t-background", priority: "BACKGROUND", resumable: false }),
        candidate({ taskId: "t-low", priority: "LOW" }),
      ]);

      expect(chosen.value?.taskId).toBe("t-low");
    });
  });

  /** §20.6 — a refusal says what would have worked. */
  it("explains why nothing could be interrupted", () => {
    const refused = choosePreemptionVictim("CRITICAL", [
      candidate({ taskId: "t-1", priority: "CRITICAL" }),
      candidate({ taskId: "t-2", resumable: false }),
      candidate({ taskId: "t-3", lockReclaimable: false }),
    ]);

    expect(refused.isFailure).toBe(true);
    // Each one is named with its own reason: "nothing to preempt" would send
    // an operator looking at the wrong three things.
    expect(refused.error?.message).toContain("t-1");
    expect(refused.error?.message).toContain("t-2");
    expect(refused.error?.message).toContain("t-3");
  });
});
