import { Task } from "../domain/task";
import { TaskNotFoundError } from "./task-application.errors";
import { GetTaskUseCase } from "./get-task.use-case";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

describe("GetTaskUseCase", () => {
  it("returns the task when it exists", async () => {
    const tasks = new InMemoryTaskRepository();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);
    const useCase = new GetTaskUseCase(tasks);

    const result = await useCase.execute(task.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.title).toBe("Do it");
  });

  it("fails when the task does not exist", async () => {
    const useCase = new GetTaskUseCase(new InMemoryTaskRepository());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(TaskNotFoundError);
  });
});
