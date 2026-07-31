import { Priority } from "@repo/db";

import { SelfTaskDependencyError } from "../domain/task.errors";
import { Task } from "../domain/task";
import {
  CircularTaskDependencyError,
  DependencyTaskNotFoundError,
  TaskNotFoundError,
} from "./task-application.errors";
import { UpdateTaskDetailsUseCase } from "./update-task-details.use-case";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

const UPDATED_BY = { updatedByType: "HUMAN" as const, updatedById: "u1" };

describe("UpdateTaskDetailsUseCase", () => {
  it("updates the details of an existing task and records who changed it", async () => {
    const tasks = new InMemoryTaskRepository();
    const task = Task.create({ workspaceId: "w1", title: "Old", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);
    const useCase = new UpdateTaskDetailsUseCase(tasks);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      title: "New",
      priority: Priority.HIGH,
      ...UPDATED_BY,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.title).toBe("New");
    expect(result.value.priority).toBe(Priority.HIGH);
    expect(result.value.updatedByType).toBe("HUMAN");
    expect(result.value.updatedById).toBe("u1");
  });

  it("fails when the task does not exist", async () => {
    const useCase = new UpdateTaskDetailsUseCase(new InMemoryTaskRepository());

    const result = await useCase.execute({ taskId: "unknown", title: "New", ...UPDATED_BY });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(TaskNotFoundError);
  });

  it("sets valid dependencies on an existing task in the same workspace", async () => {
    const tasks = new InMemoryTaskRepository();
    const task = Task.create({ workspaceId: "w1", title: "A", createdByType: "HUMAN", createdById: "u1" });
    const dependency = Task.create({ workspaceId: "w1", title: "B", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);
    await tasks.save(dependency);
    const useCase = new UpdateTaskDetailsUseCase(tasks);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      dependencies: [dependency.id.toString()],
      ...UPDATED_BY,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.dependencies).toEqual([dependency.id.toString()]);
  });

  it("rejects a self-referencing dependency", async () => {
    const tasks = new InMemoryTaskRepository();
    const task = Task.create({ workspaceId: "w1", title: "A", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);
    const useCase = new UpdateTaskDetailsUseCase(tasks);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      dependencies: [task.id.toString()],
      ...UPDATED_BY,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(SelfTaskDependencyError);
  });

  it("fails when a dependency task does not exist", async () => {
    const tasks = new InMemoryTaskRepository();
    const task = Task.create({ workspaceId: "w1", title: "A", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);
    const useCase = new UpdateTaskDetailsUseCase(tasks);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      dependencies: ["unknown"],
      ...UPDATED_BY,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(DependencyTaskNotFoundError);
  });

  it("rejects a dependency change that would create a cycle", async () => {
    const tasks = new InMemoryTaskRepository();
    const a = Task.create({ workspaceId: "w1", title: "A", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(a);
    const b = Task.create({ workspaceId: "w1", title: "B", createdByType: "HUMAN", createdById: "u1" });
    b.updateDetails({ dependencies: [a.id.toString()] }, { type: "HUMAN", id: "u1" });
    await tasks.save(b);
    const useCase = new UpdateTaskDetailsUseCase(tasks);

    // a -> b would close the loop since b already depends on a
    const result = await useCase.execute({
      taskId: a.id.toString(),
      dependencies: [b.id.toString()],
      ...UPDATED_BY,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(CircularTaskDependencyError);
  });
});
