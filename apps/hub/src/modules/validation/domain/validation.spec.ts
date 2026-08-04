import { ActorRef } from "../../identity/domain/actor";
import { Validation } from "./validation";

const now = new Date("2026-08-04T10:00:00Z");
const later = new Date("2026-08-04T11:00:00Z");
const agent = ActorRef.create("AGENT", "a-1").value;
const worker = ActorRef.create("WORKER", "w-1").value;

function requested(overrides: Record<string, unknown> = {}) {
  return Validation.request({
    workspaceId: "w-1",
    taskId: "t-1",
    type: "unit_test",
    mandatory: true,
    requestedBy: agent,
    now,
    ...overrides,
  });
}

describe("Validation", () => {
  it("records what proof is expected, by whom, and whether it is required", () => {
    const result = requested();

    expect(result.isSuccess).toBe(true);
    const validation = result.value;
    expect(validation.type).toBe("unit_test");
    expect(validation.status).toBe("PENDING");
    expect(validation.mandatory).toBe(true);
    expect(validation.requestedBy.actorId).toBe("a-1");
    expect(validation.executedBy).toBeNull();
  });

  /**
   * §11.2 — "liste ouverte : de nouveaux types peuvent être publiés via
   * l'Extension Registry". A closed enum would make the registry (§19) a
   * breaking change to this module.
   */
  it("accepts a type it has never heard of, but not an empty one", () => {
    expect(requested({ type: "accessibility_audit" }).isSuccess).toBe(true);
    expect(requested({ type: "  " }).isFailure).toBe(true);
  });

  it("refuses a validation with no workspace or no task", () => {
    expect(requested({ workspaceId: " " }).isFailure).toBe(true);
    expect(requested({ taskId: "" }).isFailure).toBe(true);
  });

  it("runs, then carries a verdict with who produced it", () => {
    const validation = requested().value;

    expect(validation.start(later).isSuccess).toBe(true);
    expect(validation.status).toBe("RUNNING");
    expect(validation.startedAt).toEqual(later);

    const recorded = validation.record({
      outcome: "SUCCEEDED",
      executedBy: worker,
      output: "42 tests, 0 failures",
      reportArtifactIds: ["art-1"],
      now: later,
    });

    expect(recorded.isSuccess).toBe(true);
    expect(validation.status).toBe("SUCCEEDED");
    expect(validation.executedBy?.actorId).toBe("w-1");
    expect(validation.reportArtifactIds).toEqual(["art-1"]);
    expect(validation.finishedAt).toEqual(later);
  });

  /** A verdict without running first is legitimate: a human just approves. */
  it("lets a verdict land without an explicit start", () => {
    const validation = requested({ type: "human_review" }).value;

    const recorded = validation.record({
      outcome: "SUCCEEDED",
      executedBy: ActorRef.create("HUMAN", "u-1").value,
      now: later,
    });

    expect(recorded.isSuccess).toBe(true);
    expect(validation.status).toBe("SUCCEEDED");
  });

  it("refuses a second verdict — proof is not rewritten", () => {
    const validation = requested().value;
    validation.record({ outcome: "FAILED", executedBy: worker, now: later });

    const again = validation.record({
      outcome: "SUCCEEDED",
      executedBy: worker,
      now: later,
    });

    expect(again.isFailure).toBe(true);
    expect(validation.status).toBe("FAILED");
  });

  it("can be skipped or cancelled before a verdict, never after", () => {
    const skipped = requested().value;
    expect(skipped.skip("not applicable to this task", later).isSuccess).toBe(true);
    expect(skipped.status).toBe("SKIPPED");

    const settled = requested().value;
    settled.record({ outcome: "SUCCEEDED", executedBy: worker, now: later });
    expect(settled.cancel(later).isFailure).toBe(true);
  });

  /**
   * §11.8 — a new commit, a policy change or a dependency change invalidates
   * previous validations. It does NOT return to PENDING: §11.1 requires the
   * history to be kept, and reusing the row would erase what was proven.
   */
  it("is invalidated rather than reset, so the history survives", () => {
    const validation = requested().value;
    validation.record({ outcome: "SUCCEEDED", executedBy: worker, now: later });

    const invalidated = validation.invalidate("the branch moved", later);

    expect(invalidated.isSuccess).toBe(true);
    expect(validation.status).toBe("SUCCEEDED");
    expect(validation.isInvalidated).toBe(true);
    expect(validation.invalidatedAt).toEqual(later);
    // And it no longer counts as proof.
    expect(validation.satisfies()).toBe(false);
  });

  it("counts as proof only when it succeeded and still holds", () => {
    const ok = requested().value;
    ok.record({ outcome: "SUCCEEDED", executedBy: worker, now: later });
    expect(ok.satisfies()).toBe(true);

    const failed = requested().value;
    failed.record({ outcome: "FAILED", executedBy: worker, now: later });
    expect(failed.satisfies()).toBe(false);

    const skipped = requested().value;
    skipped.skip("not applicable", later);
    // A skipped mandatory validation is a deliberate exemption, not a failure:
    // it stops blocking, which is the only reason to skip one.
    expect(skipped.satisfies()).toBe(true);

    expect(requested().value.satisfies()).toBe(false);
  });

  it("advertises what may happen next (§20.6)", () => {
    const validation = requested().value;

    expect(validation.allowedStatusTargets()).toEqual([
      "RUNNING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
      "SKIPPED",
    ]);
    validation.record({ outcome: "SUCCEEDED", executedBy: worker, now: later });
    expect(validation.allowedStatusTargets()).toEqual([]);
  });

  it("raises facts the journal and the alerts can read", () => {
    const validation = requested().value;
    expect(validation.domainEvents[0]?.eventName).toBe("validation.requested");
    expect(validation.domainEvents[0]?.workspaceId).toBe("w-1");

    validation.clearDomainEvents();
    validation.record({ outcome: "FAILED", executedBy: worker, now: later });

    // §17.9 lists "Validation Failed" as an alert, and severityFor() already
    // classifies a *_failed name as ERROR.
    expect(validation.domainEvents[0]?.eventName).toBe("validation.failed");
  });
});
