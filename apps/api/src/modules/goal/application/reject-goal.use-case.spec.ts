import { GoalStatus, ValidationState } from "@repo/db";

import { Goal } from "../domain/goal";
import { GoalValidationNotPendingError } from "../domain/goal.errors";
import { GoalNotFoundError } from "./goal-application.errors";
import { RejectGoalUseCase } from "./reject-goal.use-case";
import { InMemoryGoalRepository } from "./testing/in-memory-goal.repository";

describe("RejectGoalUseCase", () => {
  it("sends a goal in review back to active", async () => {
    const goals = new InMemoryGoalRepository();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    goal.changeStatus(GoalStatus.ACTIVE);
    goal.changeStatus(GoalStatus.REVIEW);
    await goals.save(goal);
    const useCase = new RejectGoalUseCase(goals);

    const result = await useCase.execute(goal.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(GoalStatus.ACTIVE);
    expect(result.value.validationState).toBe(ValidationState.REJECTED);
  });

  it("fails when the goal is not in review", async () => {
    const goals = new InMemoryGoalRepository();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const useCase = new RejectGoalUseCase(goals);

    const result = await useCase.execute(goal.id.toString());

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalValidationNotPendingError);
  });

  it("fails when the goal does not exist", async () => {
    const useCase = new RejectGoalUseCase(new InMemoryGoalRepository());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotFoundError);
  });
});
