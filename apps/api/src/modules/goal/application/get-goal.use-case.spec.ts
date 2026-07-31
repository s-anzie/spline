import { Goal } from "../domain/goal";
import { GoalNotFoundError } from "./goal-application.errors";
import { GetGoalUseCase } from "./get-goal.use-case";
import { InMemoryGoalRepository } from "./testing/in-memory-goal.repository";

describe("GetGoalUseCase", () => {
  it("returns the goal when it exists", async () => {
    const goals = new InMemoryGoalRepository();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const useCase = new GetGoalUseCase(goals);

    const result = await useCase.execute(goal.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.title).toBe("Ship it");
  });

  it("fails when the goal does not exist", async () => {
    const useCase = new GetGoalUseCase(new InMemoryGoalRepository());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotFoundError);
  });
});
