import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Task } from "../domain/task";
import { TaskNotFoundError } from "./task-application.errors";
import { AssignTaskUseCase } from "./assign-task.use-case";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

describe("AssignTaskUseCase", () => {
  it("assigns the task and publishes the event", async () => {
    const tasks = new InMemoryTaskRepository();
    const eventPublisher = new FakeEventPublisher();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.clearEvents();
    await tasks.save(task);
    const useCase = new AssignTaskUseCase(tasks, eventPublisher);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      assigneeType: "AGENT",
      assigneeId: "agent-1",
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.assigneeId).toBe("agent-1");
    expect(result.value.updatedById).toBe("user-1");
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["task.assigned"]);
  });

  it("fails when the task does not exist", async () => {
    const useCase = new AssignTaskUseCase(new InMemoryTaskRepository(), new FakeEventPublisher());

    const result = await useCase.execute({
      taskId: "unknown",
      assigneeType: "AGENT",
      assigneeId: "a1",
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(TaskNotFoundError);
  });
});
