import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/workspace.doubles";
import { Workspace } from "../../workspace/domain/workspace";
import { InMemoryGoalRepository } from "./testing/goal.doubles";
import { ChangeGoalStatusUseCase } from "./change-goal-status.use-case";
import { CompleteGoalUseCase } from "./complete-goal.use-case";
import { CreateGoalUseCase } from "./create-goal.use-case";
import { GetGoalUseCase } from "./get-goal.use-case";
import { ListGoalsUseCase } from "./list-goals.use-case";
import { UpdateGoalDetailsUseCase } from "./update-goal-details.use-case";
import { UpdateGoalProgressUseCase } from "./update-goal-progress.use-case";

const now = new Date("2026-08-04T10:00:00.000Z");

async function makeContext() {
  const goals = new InMemoryGoalRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const clock = new FakeClock(now);
  const publisher = new FakeEventPublisher();
  const workspace = Workspace.create({ organizationId: "org-1", name: "W", now }).value;
  await workspaces.save(workspace);

  return {
    goals,
    workspaces,
    workspace,
    publisher,
    create: new CreateGoalUseCase(goals, workspaces, clock, publisher),
    get: new GetGoalUseCase(goals),
    list: new ListGoalsUseCase(goals),
    update: new UpdateGoalDetailsUseCase(goals, clock, publisher),
    changeStatus: new ChangeGoalStatusUseCase(goals, clock, publisher),
    complete: new CompleteGoalUseCase(goals, clock, publisher, {
      hasOpenTasks: async () => false,
    }),
    updateProgress: new UpdateGoalProgressUseCase(goals, clock, publisher),
  };
}

function baseInput(workspaceId: string) {
  return {
    workspaceId,
    title: "Ship the runtime",
    successCriteria: ["Daemon connects"],
    ownerType: "HUMAN" as const,
    ownerId: "u-1",
  };
}

describe("goal use-cases", () => {
  describe("CreateGoalUseCase", () => {
    it("creates a root goal in an ACTIVE workspace and publishes goal.created", async () => {
      const ctx = await makeContext();

      const result = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      expect(result.isSuccess).toBe(true);
      expect(ctx.publisher.published.map((e) => e.eventName)).toContain("goal.created");
    });

    it("rejects an unknown workspace", async () => {
      const ctx = await makeContext();

      const result = await ctx.create.execute(baseInput("ghost"));

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("WorkspaceNotFoundError");
    });

    it("rejects a non-ACTIVE workspace", async () => {
      const ctx = await makeContext();
      ctx.workspace.changeStatus("PAUSED", now);
      await ctx.workspaces.save(ctx.workspace);

      const result = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("WorkspaceNotActiveError");
    });

    describe("hierarchy", () => {
      it("accepts a parent in the same workspace", async () => {
        const ctx = await makeContext();
        const parent = await ctx.create.execute(baseInput(ctx.workspace.id.value));

        const child = await ctx.create.execute({
          ...baseInput(ctx.workspace.id.value),
          parentGoalId: parent.value.goalId,
        });

        expect(child.isSuccess).toBe(true);
      });

      it("rejects an unknown parent", async () => {
        const ctx = await makeContext();

        const result = await ctx.create.execute({
          ...baseInput(ctx.workspace.id.value),
          parentGoalId: "ghost",
        });

        expect(result.isFailure).toBe(true);
        expect(result.error.name).toBe("GoalNotFoundError");
      });

      it("rejects a parent living in another workspace", async () => {
        const ctx = await makeContext();
        const other = Workspace.create({ organizationId: "org-1", name: "Other", now }).value;
        await ctx.workspaces.save(other);
        const foreign = await ctx.create.execute(baseInput(other.id.value));

        const result = await ctx.create.execute({
          ...baseInput(ctx.workspace.id.value),
          parentGoalId: foreign.value.goalId,
        });

        expect(result.isFailure).toBe(true);
        expect(result.error.name).toBe("GoalHierarchyError");
      });

      it("rejects a terminal parent", async () => {
        const ctx = await makeContext();
        const parent = await ctx.create.execute(baseInput(ctx.workspace.id.value));
        await ctx.changeStatus.execute({
          goalId: parent.value.goalId,
          status: "CANCELLED",
        });

        const result = await ctx.create.execute({
          ...baseInput(ctx.workspace.id.value),
          parentGoalId: parent.value.goalId,
        });

        expect(result.isFailure).toBe(true);
        expect(result.error.name).toBe("GoalHierarchyError");
      });
    });
  });

  describe("ListGoalsUseCase", () => {
    it("sorts by priority first, then creation order", async () => {
      const ctx = await makeContext();
      await ctx.create.execute({ ...baseInput(ctx.workspace.id.value), title: "low", priority: "LOW" });
      await ctx.create.execute({
        ...baseInput(ctx.workspace.id.value),
        title: "critical",
        priority: "CRITICAL",
      });
      await ctx.create.execute({ ...baseInput(ctx.workspace.id.value), title: "normal" });

      const result = await ctx.list.execute({ workspaceId: ctx.workspace.id.value });

      expect(result.value.map((goal) => goal.title)).toEqual([
        "critical",
        "normal",
        "low",
      ]);
    });

    it("filters root goals with an explicit null parent", async () => {
      const ctx = await makeContext();
      const parent = await ctx.create.execute(baseInput(ctx.workspace.id.value));
      await ctx.create.execute({
        ...baseInput(ctx.workspace.id.value),
        title: "child",
        parentGoalId: parent.value.goalId,
      });

      const roots = await ctx.list.execute({
        workspaceId: ctx.workspace.id.value,
        parentGoalId: null,
      });
      const children = await ctx.list.execute({
        workspaceId: ctx.workspace.id.value,
        parentGoalId: parent.value.goalId,
      });

      expect(roots.value).toHaveLength(1);
      expect(children.value.map((goal) => goal.title)).toEqual(["child"]);
    });
  });

  describe("ChangeGoalStatusUseCase", () => {
    it("changes status and publishes the event", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      const result = await ctx.changeStatus.execute({
        goalId: created.value.goalId,
        status: "ACTIVE",
      });

      expect(result.isSuccess).toBe(true);
      expect(ctx.publisher.published.map((e) => e.eventName)).toContain(
        "goal.status_changed",
      );
    });

    it("refuses COMPLETED as a status change", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      const result = await ctx.changeStatus.execute({
        goalId: created.value.goalId,
        status: "COMPLETED",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("CompletionRequiresApprovalError");
    });
  });

  describe("CompleteGoalUseCase", () => {
    async function reviewedGoal(ctx: Awaited<ReturnType<typeof makeContext>>) {
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));
      await ctx.changeStatus.execute({ goalId: created.value.goalId, status: "ACTIVE" });
      await ctx.changeStatus.execute({ goalId: created.value.goalId, status: "REVIEW" });
      return created.value.goalId;
    }

    it("completes a reviewed goal and forces progress to 100", async () => {
      const ctx = await makeContext();
      const goalId = await reviewedGoal(ctx);

      const result = await ctx.complete.execute({ goalId });

      expect(result.isSuccess).toBe(true);
      const goal = await ctx.goals.findById(goalId);
      expect(goal?.status).toBe("COMPLETED");
      expect(goal?.progress).toBe(100);
    });

    it("refuses while a sub-goal is still open", async () => {
      const ctx = await makeContext();
      const goalId = await reviewedGoal(ctx);
      await ctx.create.execute({
        ...baseInput(ctx.workspace.id.value),
        title: "child",
        parentGoalId: goalId,
      });

      const result = await ctx.complete.execute({ goalId });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("OpenChildrenError");
    });

    it("allows completion once every sub-goal is closed", async () => {
      const ctx = await makeContext();
      const goalId = await reviewedGoal(ctx);
      const child = await ctx.create.execute({
        ...baseInput(ctx.workspace.id.value),
        title: "child",
        parentGoalId: goalId,
      });
      await ctx.changeStatus.execute({ goalId: child.value.goalId, status: "CANCELLED" });

      const result = await ctx.complete.execute({ goalId });

      expect(result.isSuccess).toBe(true);
    });

    it("refuses from a state other than REVIEW", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      const result = await ctx.complete.execute({ goalId: created.value.goalId });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("InvalidStateTransitionError");
    });
  });

  describe("UpdateGoalProgressUseCase", () => {
    it("updates progress and publishes on real change only", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      await ctx.updateProgress.execute({ goalId: created.value.goalId, progress: 60 });
      const before = ctx.publisher.published.length;
      await ctx.updateProgress.execute({ goalId: created.value.goalId, progress: 60 });

      const goal = await ctx.goals.findById(created.value.goalId);
      expect(goal?.progress).toBe(60);
      expect(ctx.publisher.published).toHaveLength(before);
    });
  });

  describe("UpdateGoalDetailsUseCase / GetGoalUseCase", () => {
    it("updates and reads back", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      await ctx.update.execute({ goalId: created.value.goalId, title: "Renamed" });

      const goal = await ctx.get.execute({ goalId: created.value.goalId });
      expect(goal.value.title).toBe("Renamed");
    });

    it("fails cleanly on an unknown goal", async () => {
      const ctx = await makeContext();

      const result = await ctx.get.execute({ goalId: "ghost" });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("GoalNotFoundError");
    });
  });
});

/**
 * Found by the task module's completeness pass: a goal could be declared
 * achieved while the work serving it was still running.
 */
describe("CompleteGoalUseCase — open tasks block completion", () => {
  async function reviewedGoal(withOpenTasks: boolean) {
    const goals = new InMemoryGoalRepository();
    const workspaces = new InMemoryWorkspaceRepository();
    const clock = new FakeClock(now);
    const publisher = new FakeEventPublisher();
    const workspace = Workspace.create({ organizationId: "org-1", name: "W", now }).value;
    await workspaces.save(workspace);
    const create = new CreateGoalUseCase(goals, workspaces, clock, publisher);
    const changeStatus = new ChangeGoalStatusUseCase(goals, clock, publisher);
    const created = await create.execute(baseInput(workspace.id.value));
    await changeStatus.execute({ goalId: created.value.goalId, status: "ACTIVE" });
    await changeStatus.execute({ goalId: created.value.goalId, status: "REVIEW" });

    const complete = new CompleteGoalUseCase(goals, clock, publisher, {
      hasOpenTasks: async () => withOpenTasks,
    });
    return { complete, goalId: created.value.goalId };
  }

  it("refuses while tasks are still open", async () => {
    const { complete, goalId } = await reviewedGoal(true);

    const result = await complete.execute({ goalId });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("OpenTasksError");
  });

  it("allows completion once every task is settled", async () => {
    const { complete, goalId } = await reviewedGoal(false);

    expect((await complete.execute({ goalId })).isSuccess).toBe(true);
  });
});
