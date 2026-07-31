import { TaskStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryGoalRepository } from "../../goal/application/testing/in-memory-goal.repository";
import { RecalculateGoalProgressUseCase } from "../../goal/application/recalculate-goal-progress.use-case";
import { Goal } from "../../goal/domain/goal";
import { Task } from "../domain/task";
import { InvalidTaskStatusTransitionError } from "../domain/task.errors";
import { ChangeTaskStatusUseCase } from "./change-task-status.use-case";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import { TaskNotFoundError, UnmetTaskDependenciesError } from "./task-application.errors";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const UPDATED_BY = { updatedByType: "HUMAN" as const, updatedById: "user-1" };

describe("ChangeTaskStatusUseCase", () => {
  function setup() {
    const tasks = new InMemoryTaskRepository();
    const goals = new InMemoryGoalRepository();
    const eventPublisher = new FakeEventPublisher();
    const goalProgressSync = new GoalProgressSyncService(
      tasks,
      new RecalculateGoalProgressUseCase(goals, eventPublisher),
    );
    const useCase = new ChangeTaskStatusUseCase(tasks, goalProgressSync, eventPublisher);
    return { tasks, goals, eventPublisher, useCase };
  }

  it("changes the status and publishes the event", async () => {
    const { tasks, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);

    const result = await useCase.execute({ taskId: task.id.toString(), status: TaskStatus.TODO, ...UPDATED_BY });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(TaskStatus.TODO);
  });

  it("syncs the goal's progress when the task belongs to one", async () => {
    const { tasks, goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const task = Task.create({
      workspaceId: "w1",
      goalId: goal.id.toString(),
      title: "Do it",
      createdByType: "HUMAN",
      createdById: "u1",
    });
    await tasks.save(task);

    await useCase.execute({ taskId: task.id.toString(), status: TaskStatus.CANCELLED, ...UPDATED_BY });

    const reloadedGoal = await goals.findById(goal.id);
    // the only task became CANCELLED -> 0 relevant tasks -> 0% and no crash
    expect(reloadedGoal?.progressPercentage).toBe(0);
  });

  it("blocks moving to IN_PROGRESS while a dependency is not done", async () => {
    const { tasks, useCase } = setup();
    const dependency = Task.create({ workspaceId: "w1", title: "Dep", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(dependency);
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.updateDetails({ dependencies: [dependency.id.toString()] }, HUMAN_1);
    task.changeStatus(TaskStatus.TODO, HUMAN_1);
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      status: TaskStatus.IN_PROGRESS,
      ...UPDATED_BY,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(UnmetTaskDependenciesError);
  });

  it("allows moving to IN_PROGRESS once every dependency is done", async () => {
    const { tasks, useCase } = setup();
    const dependency = Task.create({ workspaceId: "w1", title: "Dep", createdByType: "HUMAN", createdById: "u1" });
    dependency.changeStatus(TaskStatus.TODO, HUMAN_1);
    dependency.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);
    dependency.changeStatus(TaskStatus.IN_REVIEW, HUMAN_1);
    dependency.validate(HUMAN_1);
    await tasks.save(dependency);
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.updateDetails({ dependencies: [dependency.id.toString()] }, HUMAN_1);
    task.changeStatus(TaskStatus.TODO, HUMAN_1);
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      status: TaskStatus.IN_PROGRESS,
      ...UPDATED_BY,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(TaskStatus.IN_PROGRESS);
  });

  it("fails on an invalid transition", async () => {
    const { tasks, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);

    const result = await useCase.execute({ taskId: task.id.toString(), status: TaskStatus.DONE, ...UPDATED_BY });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidTaskStatusTransitionError);
  });

  it("fails when the task does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ taskId: "unknown", status: TaskStatus.TODO, ...UPDATED_BY });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(TaskNotFoundError);
  });
});
