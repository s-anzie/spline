import { TaskStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryGoalRepository } from "../../goal/application/testing/in-memory-goal.repository";
import { RecalculateGoalProgressUseCase } from "../../goal/application/recalculate-goal-progress.use-case";
import { Goal } from "../../goal/domain/goal";
import { Task } from "../domain/task";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import { InMemoryTaskRepository } from "./testing/in-memory-task.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("GoalProgressSyncService", () => {
  function setup() {
    const tasks = new InMemoryTaskRepository();
    const goals = new InMemoryGoalRepository();
    const recalculate = new RecalculateGoalProgressUseCase(goals, new FakeEventPublisher());
    const service = new GoalProgressSyncService(tasks, recalculate);
    return { tasks, goals, service };
  }

  it("does nothing when the task has no goal", async () => {
    const { service } = setup();

    await expect(service.syncIfNeeded(undefined)).resolves.toBeUndefined();
  });

  it("recalculates the goal's progress from its non-cancelled tasks", async () => {
    const { tasks, goals, service } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const goalId = goal.id.toString();

    const done = Task.create({ workspaceId: "w1", goalId, title: "A", createdByType: "HUMAN", createdById: "u1" });
    done.changeStatus(TaskStatus.TODO, HUMAN_1);
    done.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);
    done.changeStatus(TaskStatus.IN_REVIEW, HUMAN_1);
    done.validate(HUMAN_1);
    await tasks.save(done);

    const pending = Task.create({ workspaceId: "w1", goalId, title: "B", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(pending);

    const cancelled = Task.create({ workspaceId: "w1", goalId, title: "C", createdByType: "HUMAN", createdById: "u1" });
    cancelled.changeStatus(TaskStatus.CANCELLED, HUMAN_1);
    await tasks.save(cancelled);

    await service.syncIfNeeded(goalId);

    const reloaded = await goals.findById(goal.id);
    expect(reloaded?.progressPercentage).toBe(50); // 1 done out of 2 non-cancelled tasks
  });
});
