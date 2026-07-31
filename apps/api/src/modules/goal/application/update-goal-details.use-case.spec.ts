import { Priority } from "@repo/db";

import { SelfGoalDependencyError } from "../domain/goal.errors";
import { Goal } from "../domain/goal";
import {
  CircularGoalDependencyError,
  DependencyGoalNotFoundError,
  GoalNotFoundError,
} from "./goal-application.errors";
import { UpdateGoalDetailsUseCase } from "./update-goal-details.use-case";
import { InMemoryGoalRepository } from "./testing/in-memory-goal.repository";

describe("UpdateGoalDetailsUseCase", () => {
  it("updates the details of an existing goal", async () => {
    const goals = new InMemoryGoalRepository();
    const goal = Goal.create({ workspaceId: "w1", title: "Old", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const useCase = new UpdateGoalDetailsUseCase(goals);

    const result = await useCase.execute({
      goalId: goal.id.toString(),
      title: "New",
      priority: Priority.CRITICAL,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.title).toBe("New");
    expect(result.value.priority).toBe(Priority.CRITICAL);
  });

  it("fails when the goal does not exist", async () => {
    const useCase = new UpdateGoalDetailsUseCase(new InMemoryGoalRepository());

    const result = await useCase.execute({ goalId: "unknown", title: "New" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotFoundError);
  });

  it("sets valid dependencies on an existing goal in the same workspace", async () => {
    const goals = new InMemoryGoalRepository();
    const goal = Goal.create({ workspaceId: "w1", title: "A", ownerType: "HUMAN", ownerId: "u1" });
    const dependency = Goal.create({ workspaceId: "w1", title: "B", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    await goals.save(dependency);
    const useCase = new UpdateGoalDetailsUseCase(goals);

    const result = await useCase.execute({
      goalId: goal.id.toString(),
      dependencies: [dependency.id.toString()],
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.dependencies).toEqual([dependency.id.toString()]);
  });

  it("rejects a self-referencing dependency", async () => {
    const goals = new InMemoryGoalRepository();
    const goal = Goal.create({ workspaceId: "w1", title: "A", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const useCase = new UpdateGoalDetailsUseCase(goals);

    const result = await useCase.execute({
      goalId: goal.id.toString(),
      dependencies: [goal.id.toString()],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(SelfGoalDependencyError);
  });

  it("fails when a dependency goal does not exist in the workspace", async () => {
    const goals = new InMemoryGoalRepository();
    const goal = Goal.create({ workspaceId: "w1", title: "A", ownerType: "HUMAN", ownerId: "u1" });
    const foreign = Goal.create({ workspaceId: "w2", title: "Foreign", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    await goals.save(foreign);
    const useCase = new UpdateGoalDetailsUseCase(goals);

    const result = await useCase.execute({
      goalId: goal.id.toString(),
      dependencies: ["unknown", foreign.id.toString()],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(DependencyGoalNotFoundError);
  });

  it("rejects a dependency change that would create a cycle", async () => {
    const goals = new InMemoryGoalRepository();
    const a = Goal.create({ workspaceId: "w1", title: "A", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(a);
    const b = Goal.create({ workspaceId: "w1", title: "B", ownerType: "HUMAN", ownerId: "u1" });
    b.updateDetails({ dependencies: [a.id.toString()] });
    await goals.save(b);
    const useCase = new UpdateGoalDetailsUseCase(goals);

    const result = await useCase.execute({
      goalId: a.id.toString(),
      dependencies: [b.id.toString()],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(CircularGoalDependencyError);
  });
});
