import { GoalStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Goal } from "../domain/goal";
import { InvalidGoalStatusTransitionError } from "../domain/goal.errors";
import { GoalNotFoundError } from "./goal-application.errors";
import { ChangeGoalStatusUseCase } from "./change-goal-status.use-case";
import { InMemoryGoalRepository } from "./testing/in-memory-goal.repository";

describe("ChangeGoalStatusUseCase", () => {
  function setup() {
    const goals = new InMemoryGoalRepository();
    const eventPublisher = new FakeEventPublisher();
    const useCase = new ChangeGoalStatusUseCase(goals, eventPublisher);
    return { goals, eventPublisher, useCase };
  }

  it("changes the status and publishes the event", async () => {
    const { goals, eventPublisher, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    goal.clearEvents();
    await goals.save(goal);

    const result = await useCase.execute({ goalId: goal.id.toString(), status: GoalStatus.ACTIVE });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(GoalStatus.ACTIVE);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["goal.status_changed"]);
  });

  it("fails on an invalid transition", async () => {
    const { goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);

    const result = await useCase.execute({ goalId: goal.id.toString(), status: GoalStatus.COMPLETED });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidGoalStatusTransitionError);
  });

  it("fails when the goal does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ goalId: "unknown", status: GoalStatus.ACTIVE });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotFoundError);
  });
});
