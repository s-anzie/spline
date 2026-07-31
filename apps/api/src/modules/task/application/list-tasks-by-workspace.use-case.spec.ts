import { Task } from "../domain/task";
import { ListTasksByWorkspaceUseCase } from "./list-tasks-by-workspace.use-case";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

describe("ListTasksByWorkspaceUseCase", () => {
  it("returns only the tasks of the given workspace", async () => {
    const tasks = new InMemoryTaskRepository();
    await tasks.save(Task.create({ workspaceId: "w1", title: "A", createdByType: "HUMAN", createdById: "u1" }));
    await tasks.save(Task.create({ workspaceId: "w2", title: "B", createdByType: "HUMAN", createdById: "u1" }));
    const useCase = new ListTasksByWorkspaceUseCase(tasks);

    const result = await useCase.execute("w1");

    expect(result.map((t) => t.title)).toEqual(["A"]);
  });

  it("optionally filters by goal", async () => {
    const tasks = new InMemoryTaskRepository();
    await tasks.save(
      Task.create({ workspaceId: "w1", goalId: "g1", title: "A", createdByType: "HUMAN", createdById: "u1" }),
    );
    await tasks.save(Task.create({ workspaceId: "w1", title: "B", createdByType: "HUMAN", createdById: "u1" }));
    const useCase = new ListTasksByWorkspaceUseCase(tasks);

    const result = await useCase.execute("w1", "g1");

    expect(result.map((t) => t.title)).toEqual(["A"]);
  });
});
