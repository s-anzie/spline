import { ActorRef } from "../../identity/domain/actor";
import { Goal } from "./goal";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");
const human = ActorRef.create("HUMAN", "u-1").value;

function createGoal(overrides: Partial<Parameters<typeof Goal.create>[0]> = {}) {
  return Goal.create({
    workspaceId: "w-1",
    title: "Ship the runtime",
    successCriteria: ["Daemon connects", "Sessions survive restart"],
    owner: human,
    now,
    ...overrides,
  });
}

describe("Goal", () => {
  describe("create", () => {
    it("starts PLANNED at 0%, NORMAL priority, and raises goal.created", () => {
      const result = createGoal();

      expect(result.isSuccess).toBe(true);
      const goal = result.value;
      expect(goal.status).toBe("PLANNED");
      expect(goal.progress).toBe(0);
      expect(goal.priority).toBe("NORMAL");
      expect(goal.parentGoalId).toBeNull();
      expect(goal.domainEvents[0]?.eventName).toBe("goal.created");
    });

    it("trims criteria and drops blank entries, but never accepts an empty set (§4.5)", () => {
      const trimmed = createGoal({ successCriteria: ["  a  ", "", "b"] }).value;
      expect(trimmed.successCriteria).toEqual(["a", "b"]);

      const empty = createGoal({ successCriteria: ["  ", ""] });
      expect(empty.isFailure).toBe(true);
      expect(empty.error.name).toBe("EmptySuccessCriteriaError");
      expect(createGoal({ successCriteria: [] }).isFailure).toBe(true);
    });

    it("owner must be a human or an agent — never a worker or service", () => {
      const worker = ActorRef.create("WORKER", "m-1").value;

      const result = createGoal({ owner: worker });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("IncompatibleGoalOwnerError");
    });

    it("rejects an empty title or workspace", () => {
      expect(createGoal({ title: " " }).isFailure).toBe(true);
      expect(createGoal({ workspaceId: "" }).isFailure).toBe(true);
    });

    it("accepts a parent goal id and an explicit priority", () => {
      const goal = createGoal({ parentGoalId: "g-parent", priority: "HIGH" }).value;

      expect(goal.parentGoalId).toBe("g-parent");
      expect(goal.priority).toBe("HIGH");
    });
  });

  describe("updateDetails", () => {
    it("updates title, criteria and priority, raising goal.updated", () => {
      const goal = createGoal().value;
      goal.clearDomainEvents();

      const result = goal.updateDetails(
        { title: "New title", successCriteria: ["c1"], priority: "CRITICAL" },
        later,
      );

      expect(result.isSuccess).toBe(true);
      expect(goal.title).toBe("New title");
      expect(goal.successCriteria).toEqual(["c1"]);
      expect(goal.priority).toBe("CRITICAL");
      expect(goal.updatedAt).toEqual(later);
      expect(goal.domainEvents[0]?.eventName).toBe("goal.updated");
    });

    it("rejects an empty criteria patch", () => {
      const goal = createGoal().value;

      expect(goal.updateDetails({ successCriteria: [" "] }, later).isFailure).toBe(true);
    });

    it("is forbidden once the goal is terminal", () => {
      const goal = createGoal().value;
      goal.changeStatus("CANCELLED", later);

      const result = goal.updateDetails({ title: "x" }, later);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("GoalNotEditableError");
    });
  });

  describe("changeStatus (§22.6)", () => {
    it("follows the declared machine", () => {
      const goal = createGoal().value;

      for (const next of ["ACTIVE", "BLOCKED", "ACTIVE", "REVIEW"] as const) {
        expect(goal.changeStatus(next, later).isSuccess).toBe(true);
      }
      expect(goal.status).toBe("REVIEW");
    });

    it("same-state is an idempotent no-op without event", () => {
      const goal = createGoal().value;
      goal.clearDomainEvents();

      expect(goal.changeStatus("PLANNED", later).isSuccess).toBe(true);
      expect(goal.domainEvents).toHaveLength(0);
    });

    it("COMPLETED is unreachable through changeStatus — even from REVIEW", () => {
      const goal = createGoal().value;
      goal.changeStatus("ACTIVE", later);
      goal.changeStatus("REVIEW", later);

      const result = goal.changeStatus("COMPLETED", later);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("CompletionRequiresApprovalError");
    });

    it("terminal states reject transitions with fromTerminal", () => {
      const goal = createGoal().value;
      goal.changeStatus("CANCELLED", later);

      const result = goal.changeStatus("ACTIVE", later);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("InvalidStateTransitionError");
    });
  });

  describe("complete", () => {
    it("completes from REVIEW, forcing progress to 100", () => {
      const goal = createGoal().value;
      goal.changeStatus("ACTIVE", later);
      goal.changeStatus("REVIEW", later);
      goal.clearDomainEvents();

      const result = goal.complete(later);

      expect(result.isSuccess).toBe(true);
      expect(goal.status).toBe("COMPLETED");
      expect(goal.progress).toBe(100);
      expect(goal.domainEvents[0]?.eventName).toBe("goal.status_changed");
    });

    it("refuses to complete from any state but REVIEW", () => {
      const goal = createGoal().value;
      goal.changeStatus("ACTIVE", later);

      const result = goal.complete(later);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("InvalidStateTransitionError");
    });
  });

  describe("updateProgress", () => {
    it("updates within 0-100 and raises goal.progress_updated on real change only", () => {
      const goal = createGoal().value;
      goal.clearDomainEvents();

      expect(goal.updateProgress(50, later).isSuccess).toBe(true);
      expect(goal.progress).toBe(50);
      expect(goal.domainEvents).toHaveLength(1);

      expect(goal.updateProgress(50, later).isSuccess).toBe(true);
      expect(goal.domainEvents).toHaveLength(1); // no event on no-op
    });

    it("rejects values outside 0-100", () => {
      const goal = createGoal().value;

      expect(goal.updateProgress(101, later).isFailure).toBe(true);
      expect(goal.updateProgress(-1, later).isFailure).toBe(true);
    });
  });

  it("exposes reachable statuses for the interface (§20.6) — COMPLETED never listed", () => {
    const goal = createGoal().value;
    goal.changeStatus("ACTIVE", later);
    goal.changeStatus("REVIEW", later);

    expect(goal.allowedStatusTargets()).toEqual(["ACTIVE", "CANCELLED"]);
  });

  it("reconstitute rebuilds without events", () => {
    const goal = Goal.reconstitute(
      {
        workspaceId: "w-1",
        parentGoalId: null,
        title: "T",
        description: null,
        successCriteria: ["c"],
        dependsOnGoalIds: [],
        priority: "NORMAL",
        owner: human,
        progress: 40,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: later,
      },
      "g-1",
    );

    expect(goal.id.value).toBe("g-1");
    expect(goal.domainEvents).toHaveLength(0);
  });
});
