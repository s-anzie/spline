import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/workspace.doubles";
import { Workspace } from "../../workspace/domain/workspace";
import { InMemoryGoalRepository } from "./testing/goal.doubles";
import { ChangeGoalStatusUseCase } from "./change-goal-status.use-case";
import { CreateGoalUseCase } from "./create-goal.use-case";
import { ManageGoalDependencyUseCase } from "./manage-goal-dependency.use-case";

const now = new Date("2026-08-04T10:00:00.000Z");

async function makeContext() {
  const goals = new InMemoryGoalRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const clock = new FakeClock(now);
  const publisher = new FakeEventPublisher();
  const workspace = Workspace.create({ organizationId: "org-1", name: "W", now }).value;
  await workspaces.save(workspace);
  const create = new CreateGoalUseCase(goals, workspaces, clock, publisher);

  const makeGoal = async (title: string) =>
    (
      await create.execute({
        workspaceId: workspace.id.value,
        title,
        successCriteria: ["c"],
        ownerType: "HUMAN",
        ownerId: "u-1",
      })
    ).value.goalId;

  return {
    goals,
    workspaces,
    workspace,
    makeGoal,
    create,
    dependency: new ManageGoalDependencyUseCase(goals, clock, publisher),
    changeStatus: new ChangeGoalStatusUseCase(goals, clock, publisher),
  };
}

describe("goal dependency use-cases (§5.6)", () => {
  it("adds a dependency between two goals of the same workspace", async () => {
    const ctx = await makeContext();
    const [first, second] = [await ctx.makeGoal("first"), await ctx.makeGoal("second")];

    const result = await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
      goalId: second,
      dependsOnGoalId: first,
      operation: "add",
    });

    expect(result.isSuccess).toBe(true);
    expect((await ctx.goals.findById(second))?.dependsOnGoalIds).toEqual([first]);
  });

  it("rejects a dependency on a goal from another workspace", async () => {
    const ctx = await makeContext();
    const mine = await ctx.makeGoal("mine");
    const other = Workspace.create({ organizationId: "org-1", name: "Other", now }).value;
    await ctx.workspaces.save(other);
    const foreign = (
      await ctx.create.execute({
        workspaceId: other.id.value,
        title: "foreign",
        successCriteria: ["c"],
        ownerType: "HUMAN",
        ownerId: "u-1",
      })
    ).value.goalId;

    const result = await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
      goalId: mine,
      dependsOnGoalId: foreign,
      operation: "add",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("GoalDependencyError");
  });

  it("rejects an unknown dependency target", async () => {
    const ctx = await makeContext();
    const goal = await ctx.makeGoal("g");

    const result = await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
      goalId: goal,
      dependsOnGoalId: "ghost",
      operation: "add",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("GoalNotFoundError");
  });

  it("rejects a direct cycle (A→B then B→A)", async () => {
    const ctx = await makeContext();
    const [a, b] = [await ctx.makeGoal("a"), await ctx.makeGoal("b")];
    await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value, goalId: b, dependsOnGoalId: a, operation: "add" });

    const result = await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
      goalId: a,
      dependsOnGoalId: b,
      operation: "add",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("GoalDependencyError");
  });

  it("rejects a transitive cycle (A→B→C then C→A)", async () => {
    const ctx = await makeContext();
    const [a, b, c] = [
      await ctx.makeGoal("a"),
      await ctx.makeGoal("b"),
      await ctx.makeGoal("c"),
    ];
    await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value, goalId: b, dependsOnGoalId: a, operation: "add" });
    await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value, goalId: c, dependsOnGoalId: b, operation: "add" });

    const result = await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
      goalId: a,
      dependsOnGoalId: c,
      operation: "add",
    });

    expect(result.isFailure).toBe(true);
  });

  it("removes a dependency", async () => {
    const ctx = await makeContext();
    const [a, b] = [await ctx.makeGoal("a"), await ctx.makeGoal("b")];
    await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value, goalId: b, dependsOnGoalId: a, operation: "add" });

    await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value, goalId: b, dependsOnGoalId: a, operation: "remove" });

    expect((await ctx.goals.findById(b))?.dependsOnGoalIds).toEqual([]);
  });

  describe("activation gate (§9.5 analogue)", () => {
    it("refuses ACTIVE while a dependency is not completed", async () => {
      const ctx = await makeContext();
      const [blocker, dependent] = [await ctx.makeGoal("blocker"), await ctx.makeGoal("dep")];
      await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
        goalId: dependent,
        dependsOnGoalId: blocker,
        operation: "add",
      });

      const result = await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value,
        goalId: dependent,
        status: "ACTIVE",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("UnsatisfiedDependenciesError");
    });

    it("allows ACTIVE once every dependency is completed", async () => {
      const ctx = await makeContext();
      const [blocker, dependent] = [await ctx.makeGoal("blocker"), await ctx.makeGoal("dep")];
      await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
        goalId: dependent,
        dependsOnGoalId: blocker,
        operation: "add",
      });
      const blockerGoal = (await ctx.goals.findById(blocker))!;
      blockerGoal.changeStatus("ACTIVE", now);
      blockerGoal.changeStatus("REVIEW", now);
      blockerGoal.complete(now);
      await ctx.goals.save(blockerGoal);

      const result = await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value,
        goalId: dependent,
        status: "ACTIVE",
      });

      expect(result.isSuccess).toBe(true);
    });

    it("a cancelled dependency does not block activation — it will never complete", async () => {
      const ctx = await makeContext();
      const [blocker, dependent] = [await ctx.makeGoal("blocker"), await ctx.makeGoal("dep")];
      await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
        goalId: dependent,
        dependsOnGoalId: blocker,
        operation: "add",
      });
      await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value, goalId: blocker, status: "CANCELLED" });

      const result = await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value,
        goalId: dependent,
        status: "ACTIVE",
      });

      expect(result.isSuccess).toBe(true);
    });

    it("does not gate transitions other than ACTIVE", async () => {
      const ctx = await makeContext();
      const [blocker, dependent] = [await ctx.makeGoal("blocker"), await ctx.makeGoal("dep")];
      await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
        goalId: dependent,
        dependsOnGoalId: blocker,
        operation: "add",
      });

      const result = await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value,
        goalId: dependent,
        status: "CANCELLED",
      });

      expect(result.isSuccess).toBe(true);
    });
  });
});
