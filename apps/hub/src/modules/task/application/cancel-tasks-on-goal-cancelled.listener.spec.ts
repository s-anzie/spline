import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { ActorRef } from "../../identity/domain/actor";
import { GoalStatusChanged } from "../../goal/domain/goal-events";
import { Task } from "../domain/task";
import { InMemoryTaskRepository } from "./testing/task.doubles";
import { CancelTasksOnGoalCancelledListener } from "./cancel-tasks-on-goal-cancelled.listener";

const now = new Date("2026-08-04T10:00:00.000Z");
const agent = ActorRef.create("AGENT", "a-1").value;

async function makeContext() {
  const tasks = new InMemoryTaskRepository();
  const publisher = new FakeEventPublisher();
  const listener = new CancelTasksOnGoalCancelledListener(
    tasks,
    new FakeClock(now),
    publisher,
  );

  const make = async (goalId: string, advanceTo?: "RUNNING" | "COMPLETED") => {
    const task = Task.create({
      workspaceId: "w-1",
      goalId,
      title: "T",
      acceptanceCriteria: ["c"],
      assignee: agent,
      now,
    }).value;
    if (advanceTo) {
      task.changeStatus("READY", now);
      task.changeStatus("ASSIGNED", now);
      task.changeStatus("RUNNING", now);
      if (advanceTo === "COMPLETED") {
        task.changeStatus("VALIDATING", now);
        task.complete(now);
      }
    }
    await tasks.save(task);
    return task;
  };

  return { tasks, publisher, listener, make };
}

/**
 * First real cross-module event consumer: cancelling an objective must not
 * leave live work attached to it.
 */
describe("CancelTasksOnGoalCancelledListener", () => {
  it("cancels the open tasks of a cancelled goal", async () => {
    const ctx = await makeContext();
    const planned = await ctx.make("g-1");
    const running = await ctx.make("g-1", "RUNNING");

    await ctx.listener.handle(
      new GoalStatusChanged("g-1", now, "w-1", "ACTIVE", "CANCELLED"),
    );

    expect((await ctx.tasks.findById(planned.id.value))?.status).toBe("CANCELLED");
    expect((await ctx.tasks.findById(running.id.value))?.status).toBe("CANCELLED");
  });

  it("leaves completed work alone — history is not rewritten", async () => {
    const ctx = await makeContext();
    const done = await ctx.make("g-1", "COMPLETED");

    await ctx.listener.handle(
      new GoalStatusChanged("g-1", now, "w-1", "REVIEW", "CANCELLED"),
    );

    expect((await ctx.tasks.findById(done.id.value))?.status).toBe("COMPLETED");
  });

  it("ignores every transition that is not a cancellation", async () => {
    const ctx = await makeContext();
    const task = await ctx.make("g-1");

    await ctx.listener.handle(new GoalStatusChanged("g-1", now, "w-1", "PLANNED", "ACTIVE"));

    expect((await ctx.tasks.findById(task.id.value))?.status).toBe("PLANNED");
  });

  it("does not touch the tasks of other goals", async () => {
    const ctx = await makeContext();
    const other = await ctx.make("g-2");

    await ctx.listener.handle(
      new GoalStatusChanged("g-1", now, "w-1", "ACTIVE", "CANCELLED"),
    );

    expect((await ctx.tasks.findById(other.id.value))?.status).toBe("PLANNED");
  });

  it("publishes the cancellation events so the rest of the system sees them", async () => {
    const ctx = await makeContext();
    await ctx.make("g-1");

    await ctx.listener.handle(
      new GoalStatusChanged("g-1", now, "w-1", "ACTIVE", "CANCELLED"),
    );

    expect(ctx.publisher.published.map((e) => e.eventName)).toContain(
      "task.status_changed",
    );
  });
});
