import { GoalStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetGoalUseCase } from "../../goal/application/get-goal.use-case";
import { ListGoalsByWorkspaceUseCase } from "../../goal/application/list-goals-by-workspace.use-case";
import { InMemoryGoalRepository } from "../../goal/application/testing/in-memory-goal.repository";
import { Goal } from "../../goal/domain/goal";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { EmptyTaskTitleError } from "../domain/task.errors";
import { Task } from "../domain/task";
import { CreateTaskUseCase } from "./create-task.use-case";
import {
  DependencyTaskNotFoundError,
  GoalNotInWorkspaceError,
  OrphanTaskNotAllowedError,
} from "./task-application.errors";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import { RecalculateGoalProgressUseCase } from "../../goal/application/recalculate-goal-progress.use-case";

describe("CreateTaskUseCase", () => {
  function setup() {
    const tasks = new InMemoryTaskRepository();
    const workspaces = new InMemoryWorkspaceRepository();
    const goals = new InMemoryGoalRepository();
    const getWorkspace = new GetWorkspaceUseCase(workspaces);
    const getGoal = new GetGoalUseCase(goals);
    const listGoalsByWorkspace = new ListGoalsByWorkspaceUseCase(goals);
    const eventPublisher = new FakeEventPublisher();
    const goalProgressSync = new GoalProgressSyncService(
      tasks,
      new RecalculateGoalProgressUseCase(goals, eventPublisher),
    );
    const useCase = new CreateTaskUseCase(
      tasks,
      getWorkspace,
      getGoal,
      listGoalsByWorkspace,
      goalProgressSync,
      eventPublisher,
    );
    return { tasks, workspaces, goals, eventPublisher, useCase };
  }

  it("creates a task in a workspace with no goal", async () => {
    const { tasks, workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "Write the login endpoint",
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    await expect(tasks.findById(result.value.id)).resolves.not.toBeNull();
  });

  it("creates a task under a goal and syncs the goal's progress", async () => {
    const { workspaces, goals, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const goal = Goal.create({
      workspaceId: workspace.id.toString(),
      title: "Ship it",
      ownerType: "HUMAN",
      ownerId: "user-1",
    });
    await goals.save(goal);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      goalId: goal.id.toString(),
      title: "Write the login endpoint",
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    const reloadedGoal = await goals.findById(goal.id);
    expect(reloadedGoal?.progressPercentage).toBe(0);
  });

  it("fails to create an orphan task (no goalId) when the workspace has an active goal", async () => {
    const { workspaces, goals, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const goal = Goal.create({
      workspaceId: workspace.id.toString(),
      title: "Ship it",
      ownerType: "HUMAN",
      ownerId: "user-1",
    });
    goal.changeStatus(GoalStatus.ACTIVE);
    await goals.save(goal);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "Some floating task",
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(OrphanTaskNotAllowedError);
  });

  it("still allows an explicitly-linked task when the workspace has an active goal", async () => {
    const { workspaces, goals, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const goal = Goal.create({
      workspaceId: workspace.id.toString(),
      title: "Ship it",
      ownerType: "HUMAN",
      ownerId: "user-1",
    });
    goal.changeStatus(GoalStatus.ACTIVE);
    await goals.save(goal);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      goalId: goal.id.toString(),
      title: "Properly linked task",
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
  });

  it("allows an orphan task when the workspace has no active goal (e.g. only PLANNED ones)", async () => {
    const { workspaces, goals, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const goal = Goal.create({
      workspaceId: workspace.id.toString(),
      title: "Not started yet",
      ownerType: "HUMAN",
      ownerId: "user-1",
    });
    await goals.save(goal);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "Fine to be orphan for now",
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      title: "Task",
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails when the goal belongs to a different workspace", async () => {
    const { workspaces, goals, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    const otherWorkspace = Workspace.create({ name: "Other" });
    await workspaces.save(workspace);
    await workspaces.save(otherWorkspace);
    const goal = Goal.create({
      workspaceId: otherWorkspace.id.toString(),
      title: "Ship it",
      ownerType: "HUMAN",
      ownerId: "user-1",
    });
    await goals.save(goal);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      goalId: goal.id.toString(),
      title: "Task",
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotInWorkspaceError);
  });

  it("creates a task that depends on an existing task in the same workspace", async () => {
    const { tasks, workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const dependency = Task.create({
      workspaceId: workspace.id.toString(),
      title: "Dependency",
      createdByType: "HUMAN",
      createdById: "user-1",
    });
    await tasks.save(dependency);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "Depends on the other one",
      dependencies: [dependency.id.toString()],
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.dependencies).toEqual([dependency.id.toString()]);
  });

  it("fails when a dependency task does not exist in the workspace", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "Depends on nothing real",
      dependencies: ["unknown-task"],
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(DependencyTaskNotFoundError);
  });

  it("fails when a dependency task belongs to a different workspace", async () => {
    const { tasks, workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    const otherWorkspace = Workspace.create({ name: "Other" });
    await workspaces.save(workspace);
    await workspaces.save(otherWorkspace);
    const foreignTask = Task.create({
      workspaceId: otherWorkspace.id.toString(),
      title: "Foreign",
      createdByType: "HUMAN",
      createdById: "user-1",
    });
    await tasks.save(foreignTask);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "Depends on a foreign task",
      dependencies: [foreignTask.id.toString()],
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(DependencyTaskNotFoundError);
  });

  it("fails when the title is empty", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "   ",
      createdByType: "HUMAN",
      createdById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyTaskTitleError);
  });
});
