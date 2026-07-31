import { GoalStatus, ValidationState } from "@repo/db";

import { Goal } from "../domain/goal";
import { GoalValidationNotPendingError } from "../domain/goal.errors";
import { GoalNotFoundError } from "./goal-application.errors";
import { ValidateGoalUseCase } from "./validate-goal.use-case";
import { InMemoryGoalRepository } from "./testing/in-memory-goal.repository";

describe("ValidateGoalUseCase", () => {
  it("completes a goal that is in review", async () => {
    const goals = new InMemoryGoalRepository();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    goal.changeStatus(GoalStatus.ACTIVE);
    goal.changeStatus(GoalStatus.REVIEW);
    await goals.save(goal);
    const useCase = new ValidateGoalUseCase(goals);

    const result = await useCase.execute(goal.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(GoalStatus.COMPLETED);
    expect(result.value.validationState).toBe(ValidationState.VALIDATED);
  });

  it("fails when the goal is not in review", async () => {
    const goals = new InMemoryGoalRepository();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const useCase = new ValidateGoalUseCase(goals);

    const result = await useCase.execute(goal.id.toString());

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalValidationNotPendingError);
  });

  it("fails when the goal does not exist", async () => {
    const useCase = new ValidateGoalUseCase(new InMemoryGoalRepository());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotFoundError);
  });
});
