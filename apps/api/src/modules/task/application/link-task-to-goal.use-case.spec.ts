import { TaskStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetGoalUseCase } from "../../goal/application/get-goal.use-case";
import { GoalNotFoundError } from "../../goal/application/goal-application.errors";
import { RecalculateGoalProgressUseCase } from "../../goal/application/recalculate-goal-progress.use-case";
import { InMemoryGoalRepository } from "../../goal/application/testing/in-memory-goal.repository";
import { Goal } from "../../goal/domain/goal";
import { Task } from "../domain/task";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import { LinkTaskToGoalUseCase } from "./link-task-to-goal.use-case";
import { GoalNotInWorkspaceError, TaskNotFoundError } from "./task-application.errors";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

function setup() {
  const tasks = new InMemoryTaskRepository();
  const goals = new InMemoryGoalRepository();
  const eventPublisher = new FakeEventPublisher();
  const goalProgressSync = new GoalProgressSyncService(
    tasks,
    new RecalculateGoalProgressUseCase(goals, eventPublisher),
  );
  const useCase = new LinkTaskToGoalUseCase(tasks, new GetGoalUseCase(goals), goalProgressSync, eventPublisher);
  return { tasks, goals, eventPublisher, useCase };
}

describe("LinkTaskToGoalUseCase", () => {
  it("links an orphan task to a goal and recalculates the goal's progress", async () => {
    const { tasks, goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "user-1" });
    await goals.save(goal);
    const task = Task.create({
      workspaceId: "w1",
      title: "Orphan task",
      createdByType: "HUMAN",
      createdById: "user-1",
    });
    task.changeStatus(TaskStatus.TODO, { type: "HUMAN", id: "user-1" });
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      goalId: goal.id.toString(),
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.goalId).toBe(goal.id.toString());
    const reloadedGoal = await goals.findById(goal.id);
    expect(reloadedGoal?.progressPercentage).toBe(0);
  });

  it("re-syncs both the old and new goal's progress when re-linking an already-linked task", async () => {
    const { tasks, goals, useCase } = setup();
    const oldGoal = Goal.create({ workspaceId: "w1", title: "Old goal", ownerType: "HUMAN", ownerId: "user-1" });
    const newGoal = Goal.create({ workspaceId: "w1", title: "New goal", ownerType: "HUMAN", ownerId: "user-1" });
    await goals.save(oldGoal);
    await goals.save(newGoal);
    const task = Task.create({
      workspaceId: "w1",
      goalId: oldGoal.id.toString(),
      title: "Done task",
      createdByType: "HUMAN",
      createdById: "user-1",
    });
    task.changeStatus(TaskStatus.TODO, { type: "HUMAN", id: "user-1" });
    task.changeStatus(TaskStatus.IN_PROGRESS, { type: "HUMAN", id: "user-1" });
    task.changeStatus(TaskStatus.IN_REVIEW, { type: "HUMAN", id: "user-1" });
    task.validate({ type: "HUMAN", id: "user-1" });
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      goalId: newGoal.id.toString(),
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    const reloadedOldGoal = await goals.findById(oldGoal.id);
    const reloadedNewGoal = await goals.findById(newGoal.id);
    expect(reloadedOldGoal?.progressPercentage).toBe(0);
    expect(reloadedNewGoal?.progressPercentage).toBe(100);
  });

  it("fails when the task does not exist", async () => {
    const { goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "user-1" });
    await goals.save(goal);

    const result = await useCase.execute({
      taskId: "unknown",
      goalId: goal.id.toString(),
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(TaskNotFoundError);
  });

  it("fails when the goal does not exist", async () => {
    const { tasks, useCase } = setup();
    const task = Task.create({
      workspaceId: "w1",
      title: "Orphan task",
      createdByType: "HUMAN",
      createdById: "user-1",
    });
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      goalId: "unknown",
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotFoundError);
  });

  it("fails when the goal belongs to a different workspace than the task", async () => {
    const { tasks, goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w2", title: "Ship it", ownerType: "HUMAN", ownerId: "user-1" });
    await goals.save(goal);
    const task = Task.create({
      workspaceId: "w1",
      title: "Orphan task",
      createdByType: "HUMAN",
      createdById: "user-1",
    });
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      goalId: goal.id.toString(),
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(GoalNotInWorkspaceError);
  });
});
