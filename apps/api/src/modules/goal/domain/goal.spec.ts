import { GoalStatus, Priority, ValidationState } from "@repo/db";

import { Goal } from "./goal";
import {
  EmptyBlockerReasonError,
  EmptyGoalTitleError,
  GoalValidationNotPendingError,
  InvalidGoalStatusTransitionError,
  SelfGoalDependencyError,
} from "./goal.errors";

function createGoal() {
  return Goal.create({
    workspaceId: "workspace-1",
    title: "Ship the MVP",
    ownerType: "HUMAN",
    ownerId: "user-1",
  });
}

describe("Goal", () => {
  it("creates a goal with sensible defaults", () => {
    const goal = createGoal();

    expect(goal.title).toBe("Ship the MVP");
    expect(goal.status).toBe(GoalStatus.PLANNED);
    expect(goal.priority).toBe(Priority.MEDIUM);
    expect(goal.progressPercentage).toBe(0);
    expect(goal.validationState).toBe(ValidationState.NOT_REQUIRED);
  });

  it("records a GoalCreated domain event", () => {
    const goal = createGoal();

    expect(goal.domainEvents.map((e) => e.eventName)).toEqual(["goal.created"]);
  });

  it("rejects an empty title", () => {
    expect(() =>
      Goal.create({ workspaceId: "w1", title: "   ", ownerType: "HUMAN", ownerId: "u1" }),
    ).toThrow(EmptyGoalTitleError);
  });

  it("updates its details", () => {
    const goal = createGoal();

    goal.updateDetails({ title: "Ship the real MVP", description: "desc", priority: Priority.HIGH });

    expect(goal.title).toBe("Ship the real MVP");
    expect(goal.description).toBe("desc");
    expect(goal.priority).toBe(Priority.HIGH);
  });

  it("rejects a self-referencing dependency", () => {
    const goal = createGoal();

    expect(() => goal.updateDetails({ dependencies: [goal.id.toString()] })).toThrow(
      SelfGoalDependencyError,
    );
  });

  it("accepts dependencies on other goals", () => {
    const goal = createGoal();

    goal.updateDetails({ dependencies: ["other-goal-1"] });

    expect(goal.dependencies).toEqual(["other-goal-1"]);
  });

  it("allows a valid manual status transition", () => {
    const goal = createGoal();

    goal.changeStatus(GoalStatus.ACTIVE);

    expect(goal.status).toBe(GoalStatus.ACTIVE);
  });

  it("rejects an invalid manual status transition", () => {
    const goal = createGoal();

    expect(() => goal.changeStatus(GoalStatus.COMPLETED)).toThrow(InvalidGoalStatusTransitionError);
  });

  it("rejects any transition out of a terminal status", () => {
    const goal = createGoal();
    goal.changeStatus(GoalStatus.CANCELLED);

    expect(() => goal.changeStatus(GoalStatus.ACTIVE)).toThrow(InvalidGoalStatusTransitionError);
  });

  it("marks validation as pending when entering review", () => {
    const goal = createGoal();
    goal.changeStatus(GoalStatus.ACTIVE);

    goal.changeStatus(GoalStatus.REVIEW);

    expect(goal.validationState).toBe(ValidationState.PENDING);
  });

  it("does not leave a pending validation on a goal returned to active work", () => {
    const goal = createGoal();
    goal.changeStatus(GoalStatus.ACTIVE);
    goal.changeStatus(GoalStatus.REVIEW);

    goal.changeStatus(GoalStatus.ACTIVE);

    expect(goal.status).toBe(GoalStatus.ACTIVE);
    expect(goal.validationState).toBe(ValidationState.REJECTED);
  });

  describe("recalculateProgress", () => {
    it("computes the percentage from completed vs total tasks", () => {
      const goal = createGoal();
      goal.changeStatus(GoalStatus.ACTIVE);

      goal.recalculateProgress(1, 4);

      expect(goal.progressPercentage).toBe(25);
    });

    it("auto-moves an active goal to review once every task is done", () => {
      const goal = createGoal();
      goal.changeStatus(GoalStatus.ACTIVE);

      goal.recalculateProgress(4, 4);

      expect(goal.progressPercentage).toBe(100);
      expect(goal.status).toBe(GoalStatus.REVIEW);
      expect(goal.validationState).toBe(ValidationState.PENDING);
    });

    it("does nothing to the status when there are no tasks yet", () => {
      const goal = createGoal();
      goal.changeStatus(GoalStatus.ACTIVE);

      goal.recalculateProgress(0, 0);

      expect(goal.progressPercentage).toBe(0);
      expect(goal.status).toBe(GoalStatus.ACTIVE);
    });

    it("returns a reviewed goal to active when new unfinished work lowers progress", () => {
      const goal = createGoal();
      goal.changeStatus(GoalStatus.ACTIVE);
      goal.recalculateProgress(1, 1);

      goal.recalculateProgress(1, 2);

      expect(goal.progressPercentage).toBe(50);
      expect(goal.status).toBe(GoalStatus.ACTIVE);
      expect(goal.validationState).toBe(ValidationState.REJECTED);
    });
  });

  describe("reportBlocker", () => {
    it("moves an active goal to BLOCKED and records the reason", () => {
      const goal = createGoal();
      goal.changeStatus(GoalStatus.ACTIVE);
      goal.clearEvents();

      goal.reportBlocker("Waiting on legal sign-off", "HUMAN", "user-1");

      expect(goal.status).toBe(GoalStatus.BLOCKED);
      expect(goal.blockers).toHaveLength(1);
      expect(goal.blockers[0]).toMatchObject({
        reason: "Waiting on legal sign-off",
        reportedByType: "HUMAN",
        reportedById: "user-1",
      });
      expect(goal.domainEvents.map((e) => e.eventName).sort()).toEqual([
        "goal.blocked",
        "goal.status_changed",
      ]);
    });

    it("appends another blocker without a status transition when already blocked", () => {
      const goal = createGoal();
      goal.changeStatus(GoalStatus.ACTIVE);
      goal.reportBlocker("First reason", "HUMAN", "user-1");
      goal.clearEvents();

      goal.reportBlocker("Second reason", "AGENT", "agent-1");

      expect(goal.status).toBe(GoalStatus.BLOCKED);
      expect(goal.blockers).toHaveLength(2);
      expect(goal.domainEvents.map((e) => e.eventName)).toEqual(["goal.blocked"]);
    });

    it("resolves open blockers once the goal leaves BLOCKED", () => {
      const goal = createGoal();
      goal.changeStatus(GoalStatus.ACTIVE);
      goal.reportBlocker("Waiting on legal sign-off", "HUMAN", "user-1");

      goal.changeStatus(GoalStatus.ACTIVE);

      expect(goal.blockers[0]?.resolvedAt).toBeDefined();
    });

    it("rejects an empty reason", () => {
      const goal = createGoal();
      goal.changeStatus(GoalStatus.ACTIVE);

      expect(() => goal.reportBlocker("   ", "HUMAN", "user-1")).toThrow(EmptyBlockerReasonError);
    });
  });

  describe("validate / reject", () => {
    function goalInReview() {
      const goal = createGoal();
      goal.changeStatus(GoalStatus.ACTIVE);
      goal.changeStatus(GoalStatus.REVIEW);
      goal.clearEvents();
      return goal;
    }

    it("validates a goal in review, completing it", () => {
      const goal = goalInReview();

      goal.validate();

      expect(goal.status).toBe(GoalStatus.COMPLETED);
      expect(goal.validationState).toBe(ValidationState.VALIDATED);
    });

    it("rejects a goal in review, sending it back to active", () => {
      const goal = goalInReview();

      goal.reject();

      expect(goal.status).toBe(GoalStatus.ACTIVE);
      expect(goal.validationState).toBe(ValidationState.REJECTED);
    });

    it("cannot be validated when not in review", () => {
      const goal = createGoal();

      expect(() => goal.validate()).toThrow(GoalValidationNotPendingError);
    });

    it("cannot be rejected when not in review", () => {
      const goal = createGoal();

      expect(() => goal.reject()).toThrow(GoalValidationNotPendingError);
    });
  });
});
