import { Goal } from "../domain/goal";
import { ListGoalsByWorkspaceUseCase } from "./list-goals-by-workspace.use-case";
import { InMemoryGoalRepository } from "./testing/in-memory-goal.repository";

describe("ListGoalsByWorkspaceUseCase", () => {
  it("returns only the goals of the given workspace", async () => {
    const goals = new InMemoryGoalRepository();
    await goals.save(Goal.create({ workspaceId: "w1", title: "A", ownerType: "HUMAN", ownerId: "u1" }));
    await goals.save(Goal.create({ workspaceId: "w2", title: "B", ownerType: "HUMAN", ownerId: "u1" }));
    const useCase = new ListGoalsByWorkspaceUseCase(goals);

    const result = await useCase.execute("w1");

    expect(result.map((g) => g.title)).toEqual(["A"]);
  });
});
