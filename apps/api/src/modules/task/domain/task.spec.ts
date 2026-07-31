import { Priority, TaskStatus, ValidationState } from "@repo/db";

import { Task } from "./task";
import {
  EmptyBlockerReasonError,
  EmptyTaskTitleError,
  InvalidTaskStatusTransitionError,
  SelfTaskDependencyError,
  TaskValidationNotPendingError,
} from "./task.errors";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };

function createTask() {
  return Task.create({
    workspaceId: "workspace-1",
    title: "Write the login endpoint",
    createdByType: "HUMAN",
    createdById: "user-1",
  });
}

describe("Task", () => {
  it("creates a task with sensible defaults", () => {
    const task = createTask();

    expect(task.title).toBe("Write the login endpoint");
    expect(task.status).toBe(TaskStatus.BACKLOG);
    expect(task.priority).toBe(Priority.MEDIUM);
    expect(task.validationState).toBe(ValidationState.NOT_REQUIRED);
    expect(task.goalId).toBeUndefined();
    expect(task.updatedByType).toBeUndefined();
  });

  it("records a TaskCreated domain event", () => {
    const task = createTask();

    expect(task.domainEvents.map((e) => e.eventName)).toEqual(["task.created"]);
  });

  it("rejects an empty title", () => {
    expect(() =>
      Task.create({ workspaceId: "w1", title: "  ", createdByType: "HUMAN", createdById: "u1" }),
    ).toThrow(EmptyTaskTitleError);
  });

  it("updates its details and records who made the change", () => {
    const task = createTask();

    task.updateDetails({ title: "New title", priority: Priority.CRITICAL }, HUMAN_1);

    expect(task.title).toBe("New title");
    expect(task.priority).toBe(Priority.CRITICAL);
    expect(task.updatedByType).toBe("HUMAN");
    expect(task.updatedById).toBe("user-1");
  });

  it("rejects a self-referencing dependency", () => {
    const task = createTask();

    expect(() => task.updateDetails({ dependencies: [task.id.toString()] }, HUMAN_1)).toThrow(
      SelfTaskDependencyError,
    );
  });

  it("accepts dependencies on other tasks", () => {
    const task = createTask();

    task.updateDetails({ dependencies: ["other-task-1", "other-task-2"] }, HUMAN_1);

    expect(task.dependencies).toEqual(["other-task-1", "other-task-2"]);
  });

  it("assigns the task to an actor and records an event", () => {
    const task = createTask();
    task.clearEvents();

    task.assign("AGENT", "agent-1", HUMAN_1);

    expect(task.assigneeType).toBe("AGENT");
    expect(task.assigneeId).toBe("agent-1");
    expect(task.updatedByType).toBe("HUMAN");
    expect(task.domainEvents.map((e) => e.eventName)).toEqual(["task.assigned"]);
  });

  it("allows a valid manual status transition", () => {
    const task = createTask();

    task.changeStatus(TaskStatus.TODO, HUMAN_1);
    task.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);

    expect(task.status).toBe(TaskStatus.IN_PROGRESS);
  });

  it("rejects an invalid manual status transition", () => {
    const task = createTask();

    expect(() => task.changeStatus(TaskStatus.DONE, HUMAN_1)).toThrow(
      InvalidTaskStatusTransitionError,
    );
  });

  it("rejects any transition out of a terminal status", () => {
    const task = createTask();
    task.changeStatus(TaskStatus.CANCELLED, HUMAN_1);

    expect(() => task.changeStatus(TaskStatus.TODO, HUMAN_1)).toThrow(
      InvalidTaskStatusTransitionError,
    );
  });

  it("marks validation as pending when entering review", () => {
    const task = createTask();
    task.changeStatus(TaskStatus.TODO, HUMAN_1);
    task.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);

    task.changeStatus(TaskStatus.IN_REVIEW, HUMAN_1);

    expect(task.validationState).toBe(ValidationState.PENDING);
  });

  describe("reportBlocker", () => {
    it("moves an in-progress task to BLOCKED and records the reason", () => {
      const task = createTask();
      task.changeStatus(TaskStatus.TODO, HUMAN_1);
      task.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);
      task.clearEvents();

      task.reportBlocker("Waiting on the design team", HUMAN_1);

      expect(task.status).toBe(TaskStatus.BLOCKED);
      expect(task.blockers).toHaveLength(1);
      expect(task.blockers[0]).toMatchObject({
        reason: "Waiting on the design team",
        reportedByType: "HUMAN",
        reportedById: "user-1",
      });
      expect(task.blockers[0]?.resolvedAt).toBeUndefined();
      expect(task.domainEvents.map((e) => e.eventName).sort()).toEqual([
        "task.blocked",
        "task.status_changed",
      ]);
    });

    it("appends another blocker without a status transition when already blocked", () => {
      const task = createTask();
      task.changeStatus(TaskStatus.TODO, HUMAN_1);
      task.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);
      task.reportBlocker("First reason", HUMAN_1);
      task.clearEvents();

      task.reportBlocker("Second reason", AGENT_1);

      expect(task.status).toBe(TaskStatus.BLOCKED);
      expect(task.blockers).toHaveLength(2);
      expect(task.domainEvents.map((e) => e.eventName)).toEqual(["task.blocked"]);
    });

    it("resolves open blockers once the task leaves BLOCKED", () => {
      const task = createTask();
      task.changeStatus(TaskStatus.TODO, HUMAN_1);
      task.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);
      task.reportBlocker("Waiting on the design team", HUMAN_1);

      task.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);

      expect(task.blockers[0]?.resolvedAt).toBeDefined();
    });

    it("rejects an empty reason", () => {
      const task = createTask();
      task.changeStatus(TaskStatus.TODO, HUMAN_1);
      task.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);

      expect(() => task.reportBlocker("   ", HUMAN_1)).toThrow(EmptyBlockerReasonError);
    });
  });

  describe("validate / reject", () => {
    function taskInReview() {
      const task = createTask();
      task.changeStatus(TaskStatus.TODO, HUMAN_1);
      task.changeStatus(TaskStatus.IN_PROGRESS, HUMAN_1);
      task.changeStatus(TaskStatus.IN_REVIEW, HUMAN_1);
      task.clearEvents();
      return task;
    }

    it("validates a task in review, marking it done and emitting TaskCompleted", () => {
      const task = taskInReview();

      task.validate(HUMAN_1);

      expect(task.status).toBe(TaskStatus.DONE);
      expect(task.validationState).toBe(ValidationState.VALIDATED);
      expect(task.domainEvents.map((e) => e.eventName).sort()).toEqual([
        "task.completed",
        "task.status_changed",
      ]);
    });

    it("rejects a task in review, sending it back to in progress", () => {
      const task = taskInReview();

      task.reject(HUMAN_1);

      expect(task.status).toBe(TaskStatus.IN_PROGRESS);
      expect(task.validationState).toBe(ValidationState.REJECTED);
    });

    it("cannot be validated when not in review", () => {
      const task = createTask();

      expect(() => task.validate(HUMAN_1)).toThrow(TaskValidationNotPendingError);
    });

    it("cannot be rejected when not in review", () => {
      const task = createTask();

      expect(() => task.reject(HUMAN_1)).toThrow(TaskValidationNotPendingError);
    });
  });
});
