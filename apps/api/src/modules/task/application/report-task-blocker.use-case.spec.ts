import { TaskStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Task } from "../domain/task";
import { EmptyBlockerReasonError } from "../domain/task.errors";
import { ReportTaskBlockerUseCase } from "./report-task-blocker.use-case";
import { TaskNotFoundError } from "./task-application.errors";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

describe("ReportTaskBlockerUseCase", () => {
  function setup() {
    const tasks = new InMemoryTaskRepository();
    const eventPublisher = new FakeEventPublisher();
    const useCase = new ReportTaskBlockerUseCase(tasks, eventPublisher);
    return { tasks, eventPublisher, useCase };
  }

  it("reports a blocker and moves the task to BLOCKED", async () => {
    const { tasks, eventPublisher, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.changeStatus(TaskStatus.TODO, { type: "HUMAN", id: "user-1" });
    task.changeStatus(TaskStatus.IN_PROGRESS, { type: "HUMAN", id: "user-1" });
    task.clearEvents();
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      reason: "Waiting on design",
      reporterType: "HUMAN",
      reporterId: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(TaskStatus.BLOCKED);
    expect(result.value.blockers).toHaveLength(1);
    expect(eventPublisher.published.map((e) => e.eventName).sort()).toEqual([
      "task.blocked",
      "task.status_changed",
    ]);
  });

  it("fails with an empty reason", async () => {
    const { tasks, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.changeStatus(TaskStatus.TODO, { type: "HUMAN", id: "user-1" });
    task.changeStatus(TaskStatus.IN_PROGRESS, { type: "HUMAN", id: "user-1" });
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      reason: "   ",
      reporterType: "HUMAN",
      reporterId: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyBlockerReasonError);
  });

  it("fails when the task does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      taskId: "unknown",
      reason: "Reason",
      reporterType: "HUMAN",
      reporterId: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(TaskNotFoundError);
  });
});
