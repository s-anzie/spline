import { ActorRef } from "../../identity/domain/actor";
import { Goal } from "./goal";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");
const human = ActorRef.create("HUMAN", "u-1").value;

function createGoal() {
  return Goal.create({
    workspaceId: "w-1",
    title: "Ship",
    successCriteria: ["c"],
    owner: human,
    now,
  }).value;
}

/** §5.6 lists dependencies as a Goal Engine responsibility. */
describe("Goal dependencies", () => {
  it("starts with no dependencies", () => {
    expect(createGoal().dependsOnGoalIds).toEqual([]);
  });

  it("adds a dependency and raises goal.dependency_added", () => {
    const goal = createGoal();
    goal.clearDomainEvents();

    const result = goal.addDependency("g-other", later);

    expect(result.isSuccess).toBe(true);
    expect(goal.dependsOnGoalIds).toEqual(["g-other"]);
    expect(goal.domainEvents[0]?.eventName).toBe("goal.dependency_added");
  });

  it("adding the same dependency twice is an idempotent no-op", () => {
    const goal = createGoal();
    goal.addDependency("g-other", later);
    goal.clearDomainEvents();

    const result = goal.addDependency("g-other", later);

    expect(result.isSuccess).toBe(true);
    expect(goal.dependsOnGoalIds).toEqual(["g-other"]);
    expect(goal.domainEvents).toHaveLength(0);
  });

  it("refuses a self-dependency", () => {
    const goal = createGoal();

    const result = goal.addDependency(goal.id.value, later);

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("GoalDependencyError");
  });

  it("removes a dependency, raising the event only when one was there", () => {
    const goal = createGoal();
    goal.addDependency("g-other", later);
    goal.clearDomainEvents();

    goal.removeDependency("g-other", later);
    expect(goal.dependsOnGoalIds).toEqual([]);
    expect(goal.domainEvents).toHaveLength(1);
    expect(goal.domainEvents[0]?.eventName).toBe("goal.dependency_removed");

    goal.removeDependency("g-other", later);
    expect(goal.domainEvents).toHaveLength(1);
  });

  it("refuses dependency changes on a terminal goal", () => {
    const goal = createGoal();
    goal.changeStatus("CANCELLED", later);

    expect(goal.addDependency("g-other", later).isFailure).toBe(true);
  });

  it("reconstitute restores dependencies", () => {
    const goal = Goal.reconstitute(
      {
        workspaceId: "w-1",
        parentGoalId: null,
        title: "T",
        description: null,
        successCriteria: ["c"],
        dependsOnGoalIds: ["a", "b"],
        priority: "NORMAL",
        owner: human,
        progress: 0,
        status: "PLANNED",
        createdAt: now,
        updatedAt: now,
      },
      "g-1",
    );

    expect(goal.dependsOnGoalIds).toEqual(["a", "b"]);
  });
});
