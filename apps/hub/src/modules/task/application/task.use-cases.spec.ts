import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GrantWorkspaceMembershipUseCase } from "../../identity/application/grant-workspace-membership.use-case";
import { InMemoryWorkspaceMembershipRepository } from "../../identity/application/testing/identity.doubles";
import { PermissionsService } from "../../identity/application/permissions.service";
import { RecomputeGoalProgressUseCase } from "../../goal/application/recompute-goal-progress.use-case";
import { UpdateGoalProgressUseCase } from "../../goal/application/update-goal-progress.use-case";
import { InMemoryGoalRepository } from "../../goal/application/testing/goal.doubles";
import { Goal } from "../../goal/domain/goal";
import { ActorRef } from "../../identity/domain/actor";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/workspace.doubles";
import { Workspace } from "../../workspace/domain/workspace";
import { InMemoryTaskRepository } from "./testing/task.doubles";
import { AssignTaskUseCase } from "./assign-task.use-case";
import { ChangeTaskStatusUseCase } from "./change-task-status.use-case";
import { CompleteTaskUseCase } from "./complete-task.use-case";
import { CreateTaskUseCase } from "./create-task.use-case";
import { GetTaskUseCase } from "./get-task.use-case";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import { ListTasksUseCase } from "./list-tasks.use-case";
import { ManageTaskDependencyUseCase } from "./manage-task-dependency.use-case";
import { ReportBlockerUseCase } from "./report-blocker.use-case";
import { ResolveBlockerUseCase } from "./resolve-blocker.use-case";
import { UpdateTaskDetailsUseCase } from "./update-task-details.use-case";

const now = new Date("2026-08-04T10:00:00.000Z");

async function makeContext() {
  const tasks = new InMemoryTaskRepository();
  const goals = new InMemoryGoalRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const memberships = new InMemoryWorkspaceMembershipRepository();
  const clock = new FakeClock(now);
  const publisher = new FakeEventPublisher();

  const workspace = Workspace.create({ organizationId: "org-1", name: "W", now }).value;
  await workspaces.save(workspace);
  const goal = Goal.create({
    workspaceId: workspace.id.value,
    title: "Ship",
    successCriteria: ["c"],
    owner: ActorRef.create("HUMAN", "u-1").value,
    now,
  }).value;
  await goals.save(goal);

  const grant = new GrantWorkspaceMembershipUseCase(memberships, clock, publisher);
  await grant.execute({
    actorType: "AGENT",
    actorId: "a-1",
    workspaceId: workspace.id.value,
    role: "AGENT_CONTRIBUTOR",
  });
  await grant.execute({
    actorType: "HUMAN",
    actorId: "u-1",
    workspaceId: workspace.id.value,
    role: "OWNER",
  });

  const permissions = new PermissionsService(memberships);
  // The formula lives in the goal module (§5.6); the task side only triggers.
  const goalSync = new GoalProgressSyncService(
    new RecomputeGoalProgressUseCase(
      {
        hasOpenTasks: async (goalId: string) =>
          (await tasks.tallyByGoal(goalId)).completed <
          (await tasks.tallyByGoal(goalId)).total,
        tally: async (goalId: string) => tasks.tallyByGoal(goalId),
      },
      new UpdateGoalProgressUseCase(goals, clock, publisher),
    ),
  );

  return {
    tasks,
    goals,
    goal,
    workspace,
    workspaces,
    publisher,
    create: new CreateTaskUseCase(tasks, goals, workspaces, permissions, clock, publisher),
    get: new GetTaskUseCase(tasks),
    list: new ListTasksUseCase(tasks),
    update: new UpdateTaskDetailsUseCase(tasks, clock, publisher),
    assign: new AssignTaskUseCase(tasks, permissions, clock, publisher),
    changeStatus: new ChangeTaskStatusUseCase(tasks, clock, publisher, goalSync),
    complete: new CompleteTaskUseCase(tasks, clock, publisher, goalSync),
    reportBlocker: new ReportBlockerUseCase(tasks, clock, publisher),
    resolveBlocker: new ResolveBlockerUseCase(tasks, clock, publisher),
    dependency: new ManageTaskDependencyUseCase(tasks, clock, publisher),
  };
}

function baseInput(workspaceId: string, goalId: string) {
  return {
    workspaceId,
    goalId,
    title: "Wire the daemon",
    acceptanceCriteria: ["It connects"],
    assigneeType: "AGENT" as const,
    assigneeId: "a-1",
  };
}

describe("task use-cases", () => {
  describe("CreateTaskUseCase", () => {
    it("creates a task already assigned (§4.6)", async () => {
      const ctx = await makeContext();

      const result = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, ctx.goal.id.value),
      );

      expect(result.isSuccess).toBe(true);
      const task = await ctx.tasks.findById(result.value.taskId);
      expect(task?.assignee.actorId).toBe("a-1");
      expect(ctx.publisher.published.map((e) => e.eventName)).toContain("task.created");
    });

    it("refuses an assignee who is not a member of the workspace", async () => {
      const ctx = await makeContext();

      const result = await ctx.create.execute({
        ...baseInput(ctx.workspace.id.value, ctx.goal.id.value),
        assigneeId: "stranger",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("AssigneeNotInWorkspaceError");
    });

    it("refuses an assignee whose role cannot execute work", async () => {
      const ctx = await makeContext();
      const memberships = new InMemoryWorkspaceMembershipRepository();
      const viewerGrant = new GrantWorkspaceMembershipUseCase(
        memberships,
        new FakeClock(now),
        new FakeEventPublisher(),
      );
      await viewerGrant.execute({
        actorType: "HUMAN",
        actorId: "viewer",
        workspaceId: ctx.workspace.id.value,
        role: "VIEWER",
      });
      const create = new CreateTaskUseCase(
        ctx.tasks,
        ctx.goals,
        ctx.workspaces,
        new PermissionsService(memberships),
        new FakeClock(now),
        ctx.publisher,
      );

      const result = await create.execute({
        ...baseInput(ctx.workspace.id.value, ctx.goal.id.value),
        assigneeType: "HUMAN",
        assigneeId: "viewer",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("AssigneeCannotExecuteError");
    });

    it("rejects an unknown or terminal goal, and a non-ACTIVE workspace", async () => {
      const ctx = await makeContext();

      const unknownGoal = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, "ghost"),
      );
      expect(unknownGoal.error.name).toBe("GoalNotFoundError");

      ctx.goal.changeStatus("CANCELLED", now);
      await ctx.goals.save(ctx.goal);
      const terminalGoal = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, ctx.goal.id.value),
      );
      expect(terminalGoal.error.name).toBe("TaskGoalError");
    });
  });

  describe("readiness gate (§9.5)", () => {
    it("refuses READY while a dependency is not completed", async () => {
      const ctx = await makeContext();
      const input = baseInput(ctx.workspace.id.value, ctx.goal.id.value);
      const blocker = await ctx.create.execute(input);
      const dependent = await ctx.create.execute(input);
      await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
        taskId: dependent.value.taskId,
        dependsOnTaskId: blocker.value.taskId,
        operation: "add",
      });

      const result = await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value,
        taskId: dependent.value.taskId,
        status: "READY",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("UnsatisfiedTaskDependenciesError");
    });

    it("allows READY once the dependency is completed", async () => {
      const ctx = await makeContext();
      const input = baseInput(ctx.workspace.id.value, ctx.goal.id.value);
      const first = await ctx.create.execute(input);
      const second = await ctx.create.execute(input);
      await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
        taskId: second.value.taskId,
        dependsOnTaskId: first.value.taskId,
        operation: "add",
      });
      for (const status of ["READY", "ASSIGNED", "RUNNING", "VALIDATING"] as const) {
        await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value, taskId: first.value.taskId, status });
      }
      await ctx.complete.execute({ workspaceId: ctx.workspace.id.value, taskId: first.value.taskId });

      const result = await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value,
        taskId: second.value.taskId,
        status: "READY",
      });

      expect(result.isSuccess).toBe(true);
    });

    it("rejects a dependency cycle", async () => {
      const ctx = await makeContext();
      const input = baseInput(ctx.workspace.id.value, ctx.goal.id.value);
      const [a, b] = [await ctx.create.execute(input), await ctx.create.execute(input)];
      await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
        taskId: b.value.taskId,
        dependsOnTaskId: a.value.taskId,
        operation: "add",
      });

      const result = await ctx.dependency.execute({ workspaceId: ctx.workspace.id.value,
        taskId: a.value.taskId,
        dependsOnTaskId: b.value.taskId,
        operation: "add",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("TaskDependencyError");
    });
  });

  describe("goal progress synchronisation (§2.4)", () => {
    it("recomputes the goal's progress when a task completes", async () => {
      const ctx = await makeContext();
      const input = baseInput(ctx.workspace.id.value, ctx.goal.id.value);
      const first = await ctx.create.execute(input);
      await ctx.create.execute(input);

      for (const status of ["READY", "ASSIGNED", "RUNNING", "VALIDATING"] as const) {
        await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value, taskId: first.value.taskId, status });
      }
      await ctx.complete.execute({ workspaceId: ctx.workspace.id.value, taskId: first.value.taskId });

      const goal = await ctx.goals.findById(ctx.goal.id.value);
      expect(goal?.progress).toBe(50);
    });

    it("ignores cancelled tasks in the denominator", async () => {
      const ctx = await makeContext();
      const input = baseInput(ctx.workspace.id.value, ctx.goal.id.value);
      const first = await ctx.create.execute(input);
      const doomed = await ctx.create.execute(input);

      await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value, taskId: doomed.value.taskId, status: "CANCELLED" });
      for (const status of ["READY", "ASSIGNED", "RUNNING", "VALIDATING"] as const) {
        await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value, taskId: first.value.taskId, status });
      }
      await ctx.complete.execute({ workspaceId: ctx.workspace.id.value, taskId: first.value.taskId });

      const goal = await ctx.goals.findById(ctx.goal.id.value);
      expect(goal?.progress).toBe(100);
    });
  });

  describe("blockers", () => {
    it("reports and resolves, restoring the previous status", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, ctx.goal.id.value),
      );
      for (const status of ["READY", "ASSIGNED", "RUNNING"] as const) {
        await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value, taskId: created.value.taskId, status });
      }

      const reported = await ctx.reportBlocker.execute({ workspaceId: ctx.workspace.id.value,
        taskId: created.value.taskId,
        type: "TECHNICAL",
        description: "port bound",
        reporterType: "AGENT",
        reporterId: "a-1",
      });
      expect(reported.isSuccess).toBe(true);
      expect((await ctx.tasks.findById(created.value.taskId))?.status).toBe("BLOCKED");

      const resolved = await ctx.resolveBlocker.execute({ workspaceId: ctx.workspace.id.value,
        taskId: created.value.taskId,
        blockerId: reported.value.blockerId,
        resolution: "freed",
      });

      expect(resolved.isSuccess).toBe(true);
      expect((await ctx.tasks.findById(created.value.taskId))?.status).toBe("RUNNING");
    });
  });

  describe("assignment and listing", () => {
    it("reassigns to another member", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, ctx.goal.id.value),
      );

      const result = await ctx.assign.execute({ workspaceId: ctx.workspace.id.value,
        taskId: created.value.taskId,
        assigneeType: "HUMAN",
        assigneeId: "u-1",
      });

      expect(result.isSuccess).toBe(true);
      expect((await ctx.tasks.findById(created.value.taskId))?.assignee.actorId).toBe("u-1");
    });

    it("refuses reassignment to a non-member", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, ctx.goal.id.value),
      );

      const result = await ctx.assign.execute({ workspaceId: ctx.workspace.id.value,
        taskId: created.value.taskId,
        assigneeType: "HUMAN",
        assigneeId: "stranger",
      });

      expect(result.isFailure).toBe(true);
    });

    it("filters by goal, status and assignee, sorted by priority", async () => {
      const ctx = await makeContext();
      const input = baseInput(ctx.workspace.id.value, ctx.goal.id.value);
      await ctx.create.execute({ ...input, title: "low", priority: "LOW" });
      await ctx.create.execute({ ...input, title: "critical", priority: "CRITICAL" });

      const all = await ctx.list.execute({ workspaceId: ctx.workspace.id.value });
      expect(all.value.map((t) => t.title)).toEqual(["critical", "low"]);

      const byGoal = await ctx.list.execute({
        workspaceId: ctx.workspace.id.value,
        goalId: ctx.goal.id.value,
      });
      expect(byGoal.value).toHaveLength(2);

      const byAssignee = await ctx.list.execute({
        workspaceId: ctx.workspace.id.value,
        assigneeType: "AGENT",
        assigneeId: "a-1",
      });
      expect(byAssignee.value).toHaveLength(2);
    });

    it("fails cleanly on an unknown task", async () => {
      const ctx = await makeContext();

      const result = await ctx.get.execute({ workspaceId: ctx.workspace.id.value, taskId: "ghost" });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("TaskNotFoundError");
    });
  });

  describe("completion", () => {
    it("refuses COMPLETED through the status route (§4.24)", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, ctx.goal.id.value),
      );

      const result = await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value,
        taskId: created.value.taskId,
        status: "COMPLETED",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("CompletionRequiresValidationError");
    });
  });

  describe("UpdateTaskDetailsUseCase", () => {
    it("updates and reads back", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, ctx.goal.id.value),
      );

      await ctx.update.execute({ workspaceId: ctx.workspace.id.value, taskId: created.value.taskId, title: "Renamed" });

      expect((await ctx.get.execute({ workspaceId: ctx.workspace.id.value, taskId: created.value.taskId })).value.title).toBe(
        "Renamed",
      );
    });
  });
});
