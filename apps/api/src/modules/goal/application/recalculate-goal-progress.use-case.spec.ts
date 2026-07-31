import { GoalStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Goal } from "../domain/goal";
import { GoalNotFoundError } from "./goal-application.errors";
import { RecalculateGoalProgressUseCase } from "./recalculate-goal-progress.use-case";
import { InMemoryGoalRepository } from "./testing/in-memory-goal.repository";

describe("RecalculateGoalProgressUseCase", () => {
  function setup() {
    const goals = new InMemoryGoalRepository();
    const eventPublisher = new FakeEventPublisher();
    const useCase = new RecalculateGoalProgressUseCase(goals, eventPublisher);
    return { goals, eventPublisher, useCase };
  }

  it("updates the progress percentage from task counts", async () => {
    const { goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    goal.changeStatus(GoalStatus.ACTIVE);
    await goals.save(goal);

    const result = await useCase.execute({
      goalId: goal.id.toString(),
      completedTaskCount: 3,
      totalTaskCount: 4,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.progressPercentage).toBe(75);
  });

  it("auto-transitions to review and publishes both events at 100%", async () => {
    const { goals, eventPublisher, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    goal.changeStatus(GoalStatus.ACTIVE);
    goal.clearEvents();
    await goals.save(goal);

    const result = await useCase.execute({
      goalId: goal.id.toString(),
      completedTaskCount: 2,
      totalTaskCount: 2,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(GoalStatus.REVIEW);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual([
      "goal.progress_changed",
      "goal.status_changed",
    ]);
  });

  it("fails when the goal does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      goalId: "unknown",
      completedTaskCount: 1,
      totalTaskCount: 1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotFoundError);
  });
});
