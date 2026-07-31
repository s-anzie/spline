import { GoalStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Goal } from "../domain/goal";
import { EmptyBlockerReasonError } from "../domain/goal.errors";
import { GoalNotFoundError } from "./goal-application.errors";
import { ReportGoalBlockerUseCase } from "./report-goal-blocker.use-case";
import { InMemoryGoalRepository } from "./testing/in-memory-goal.repository";

describe("ReportGoalBlockerUseCase", () => {
  function setup() {
    const goals = new InMemoryGoalRepository();
    const eventPublisher = new FakeEventPublisher();
    const useCase = new ReportGoalBlockerUseCase(goals, eventPublisher);
    return { goals, eventPublisher, useCase };
  }

  it("reports a blocker and moves the goal to BLOCKED", async () => {
    const { goals, eventPublisher, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    goal.changeStatus(GoalStatus.ACTIVE);
    goal.clearEvents();
    await goals.save(goal);

    const result = await useCase.execute({
      goalId: goal.id.toString(),
      reason: "Waiting on legal",
      reporterType: "HUMAN",
      reporterId: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(GoalStatus.BLOCKED);
    expect(result.value.blockers).toHaveLength(1);
    expect(eventPublisher.published.map((e) => e.eventName).sort()).toEqual([
      "goal.blocked",
      "goal.status_changed",
    ]);
  });

  it("fails with an empty reason", async () => {
    const { goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    goal.changeStatus(GoalStatus.ACTIVE);
    await goals.save(goal);

    const result = await useCase.execute({
      goalId: goal.id.toString(),
      reason: "   ",
      reporterType: "HUMAN",
      reporterId: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyBlockerReasonError);
  });

  it("fails when the goal does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      goalId: "unknown",
      reason: "Reason",
      reporterType: "HUMAN",
      reporterId: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotFoundError);
  });
});
