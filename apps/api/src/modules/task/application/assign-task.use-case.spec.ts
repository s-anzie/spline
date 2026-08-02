import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetAgentUseCase } from "../../agent/application/get-agent.use-case";
import { InMemoryAgentRepository } from "../../agent/application/testing/in-memory-agent.repository";
import { Agent } from "../../agent/domain/agent";
import { Task } from "../domain/task";
import { AgentNotEligibleError } from "../../agent/application/agent-application.errors";
import { TaskNotFoundError } from "./task-application.errors";
import { AssignTaskUseCase } from "./assign-task.use-case";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

function setup() {
  const tasks = new InMemoryTaskRepository();
  const agents = new InMemoryAgentRepository();
  const eventPublisher = new FakeEventPublisher();
  const useCase = new AssignTaskUseCase(tasks, new GetAgentUseCase(agents), eventPublisher);
  return { tasks, agents, eventPublisher, useCase };
}

describe("AssignTaskUseCase", () => {
  it("assigns the task to an eligible agent and publishes the event", async () => {
    const { tasks, agents, eventPublisher, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.clearEvents();
    await tasks.save(task);
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    await agents.save(agent);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      assigneeType: "AGENT",
      assigneeId: agent.id.toString(),
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.assigneeId).toBe(agent.id.toString());
    expect(result.value.updatedById).toBe("user-1");
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["task.assigned"]);
  });

  it("assigns to a HUMAN without any agent eligibility check", async () => {
    const { tasks, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.clearEvents();
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      assigneeType: "HUMAN",
      assigneeId: "some-user",
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
  });

  it("rejects assigning a task to a disabled agent", async () => {
    const { tasks, agents, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.clearEvents();
    await tasks.save(task);
    const agent = Agent.create({ workspaceId: "w1", provider: "claude", displayName: "Worker" });
    agent.disable();
    await agents.save(agent);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      assigneeType: "AGENT",
      assigneeId: agent.id.toString(),
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentNotEligibleError);
  });

  it("does not reject assignment to an agent id that doesn't exist (existence isn't this use case's concern)", async () => {
    const { tasks, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    task.clearEvents();
    await tasks.save(task);

    const result = await useCase.execute({
      taskId: task.id.toString(),
      assigneeType: "AGENT",
      assigneeId: "unknown-agent",
      updatedByType: "HUMAN",
      updatedById: "user-1",
    });

    expect(result.isSuccess).toBe(true);
  });

  it("fails when the task does not exist", async () => {
    const { useCase } = setup();

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
