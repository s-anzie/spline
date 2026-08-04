import { ActorRef } from "../../identity/domain/actor";
import { MergeRequest, unmetMergeConditions } from "./merge-request";

const now = new Date("2026-08-04T10:00:00Z");
const later = new Date("2026-08-04T11:00:00Z");
const agent = ActorRef.create("AGENT", "a-1").value;
const human = ActorRef.create("HUMAN", "u-1").value;

function requested(overrides: Record<string, unknown> = {}) {
  return MergeRequest.request({
    repositoryId: "r-1",
    workspaceId: "w-1",
    sourceBranchId: "b-source",
    targetBranchId: "b-main",
    taskId: "t-1",
    requestedBy: agent,
    now,
    ...overrides,
  });
}

/** §8.7 — the four conditions, each reported by name (§17.8). */
describe("unmetMergeConditions", () => {
  const satisfied = {
    unsatisfiedValidations: [] as { id: string; type: string }[],
    violatedPolicies: [] as string[],
    openConflicts: [] as { id: string; type: string }[],
    approved: true,
  };

  it("allows a merge when every condition holds", () => {
    expect(unmetMergeConditions(satisfied)).toEqual([]);
  });

  it("names the validations that have not passed", () => {
    const unmet = unmetMergeConditions({
      ...satisfied,
      unsatisfiedValidations: [{ id: "v-1", type: "build" }],
    });

    expect(unmet).toHaveLength(1);
    // Naming which one is what lets a caller act (§17.8).
    expect(unmet[0]).toContain("build");
  });

  it("names the policies that are violated", () => {
    const unmet = unmetMergeConditions({
      ...satisfied,
      violatedPolicies: ["protected_branches"],
    });

    expect(unmet[0]).toContain("protected_branches");
  });

  /** §8.9 — "un conflit non résolu bloque la tâche". */
  it("names the conflicts that are still open", () => {
    const unmet = unmetMergeConditions({
      ...satisfied,
      openConflicts: [{ id: "c-1", type: "file" }],
    });

    expect(unmet[0]).toContain("c-1");
  });

  it("reports the missing approval", () => {
    expect(unmetMergeConditions({ ...satisfied, approved: false })[0]).toContain(
      "approval",
    );
  });

  it("reports every unmet condition at once, not just the first", () => {
    const unmet = unmetMergeConditions({
      unsatisfiedValidations: [{ id: "v-1", type: "build" }],
      violatedPolicies: ["protected_branches"],
      openConflicts: [{ id: "c-1", type: "file" }],
      approved: false,
    });

    // Fixing one at a time, discovering the next each round, is the shape of
    // a bad refusal.
    expect(unmet).toHaveLength(4);
  });
});

describe("MergeRequest", () => {
  it("records who asked, for which task, from where to where", () => {
    const result = requested();

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe("PENDING");
    expect(result.value.requestedBy.actorId).toBe("a-1");
    expect(result.value.taskId).toBe("t-1");
  });

  it("refuses a merge into the branch it comes from", () => {
    const result = requested({ targetBranchId: "b-source" });

    expect(result.isFailure).toBe(true);
  });

  it("refuses a request with no repository, branch or task", () => {
    expect(requested({ repositoryId: " " }).isFailure).toBe(true);
    expect(requested({ sourceBranchId: "" }).isFailure).toBe(true);
    expect(requested({ taskId: "  " }).isFailure).toBe(true);
  });

  /**
   * §8.7 — "jamais réalisé par un agent". Enforced by the permission matrix
   * at the route (approve_validation, which no agent role holds), and stated
   * again here so the aggregate does not depend on a guard to be correct.
   */
  it("refuses to be approved by an agent, whatever the route allowed", () => {
    const request = requested().value;

    const result = request.approve(agent, later);

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("MergeNotAllowedError");
    expect(request.status).toBe("PENDING");
  });

  it("is approved by a human, then merged", () => {
    const request = requested().value;

    expect(request.approve(human, later).isSuccess).toBe(true);
    expect(request.status).toBe("APPROVED");
    expect(request.decidedBy?.actorId).toBe("u-1");

    expect(request.markMerged(later).isSuccess).toBe(true);
    expect(request.status).toBe("MERGED");
  });

  it("cannot be merged before it is approved", () => {
    const request = requested().value;

    expect(request.markMerged(later).isFailure).toBe(true);
  });

  it("is rejected with a reason, and the reason is kept", () => {
    const request = requested().value;

    expect(request.reject(human, "the approach changed", later).isSuccess).toBe(true);
    expect(request.status).toBe("REJECTED");
    expect(request.decisionReason).toBe("the approach changed");
  });

  it("cannot be decided twice", () => {
    const request = requested().value;
    request.approve(human, later);

    expect(request.reject(human, "changed my mind", later).isFailure).toBe(true);
    expect(request.status).toBe("APPROVED");
  });

  it("advertises what may happen next (§20.6)", () => {
    const request = requested().value;

    expect(request.allowedStatusTargets()).toEqual(["APPROVED", "REJECTED"]);
    request.approve(human, later);
    expect(request.allowedStatusTargets()).toEqual(["MERGED"]);
  });
});
