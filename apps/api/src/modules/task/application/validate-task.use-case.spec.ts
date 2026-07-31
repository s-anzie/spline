import { TaskStatus, ValidationState } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryGoalRepository } from "../../goal/application/testing/in-memory-goal.repository";
import { RecalculateGoalProgressUseCase } from "../../goal/application/recalculate-goal-progress.use-case";
import { Goal } from "../../goal/domain/goal";
import { Task } from "../domain/task";
import { TaskValidationNotPendingError } from "../domain/task.errors";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import { TaskNotFoundError } from "./task-application.errors";
import { ValidateTaskUseCase } from "./validate-task.use-case";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const UPDATED_BY = { updatedByType: "HUMAN" as const, updatedById: "user-1" };

describe("ValidateTaskUseCase", () => {
  function setup() {
    const tasks = new InMemoryTaskRepository();
    const goals = new InMemoryGoalRepository();
    const eventPublisher = new FakeEventPublisher();
    const goalProgressSync = new GoalProgressSyncService(
      tasks,
      new RecalculateGoalProgressUseCase(goals, eventPublisher),
    );
    const useCase = new ValidateTaskUseCase(tasks, goalProgressSync, eventPublisher);
    return { tasks, goals, eventPublisher, useCase };
  }

  function taskInReview(workspaceId: string, goalId?: string) {
    const task = Task.create({ workspaceId, goalId, title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.changeStatus(TaskStatus.TODO, HUMAN_1);
    task.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);
    task.changeStatus(TaskStatus.IN_REVIEW, HUMAN_1);
    task.clearEvents();
    return task;
  }

  it("completes a task in review and updates its goal's progress", async () => {
    const { tasks, goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const task = taskInReview("w1", goal.id.toString());
    await tasks.save(task);

    const result = await useCase.execute({ taskId: task.id.toString(), ...UPDATED_BY });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(TaskStatus.DONE);
    expect(result.value.validationState).toBe(ValidationState.VALIDATED);
    const reloadedGoal = await goals.findById(goal.id);
    expect(reloadedGoal?.progressPercentage).toBe(100);
  });

  it("fails when the task is not in review", async () => {
    const { tasks, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);

    const result = await useCase.execute({ taskId: task.id.toString(), ...UPDATED_BY });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(TaskValidationNotPendingError);
  });

  it("fails when the task does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ taskId: "unknown", ...UPDATED_BY });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(TaskNotFoundError);
  });
});
