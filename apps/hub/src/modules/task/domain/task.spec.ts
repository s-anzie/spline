import { ActorRef } from "../../identity/domain/actor";
import { Task } from "./task";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");
const agent = ActorRef.create("AGENT", "a-1").value;
const human = ActorRef.create("HUMAN", "u-1").value;

function createTask(overrides: Partial<Parameters<typeof Task.create>[0]> = {}) {
  return Task.create({
    workspaceId: "w-1",
    goalId: "g-1",
    title: "Wire the daemon",
    acceptanceCriteria: ["It connects", "It survives a restart"],
    assignee: agent,
    now,
    ...overrides,
  });
}

/** Walks a task to a given status through legal transitions. */
function taskAt(status: Parameters<Task["changeStatus"]>[0]) {
  const task = createTask().value;
  const path: Record<string, readonly string[]> = {
    PLANNED: [],
    READY: ["READY"],
    ASSIGNED: ["READY", "ASSIGNED"],
    RUNNING: ["READY", "ASSIGNED", "RUNNING"],
    VALIDATING: ["READY", "ASSIGNED", "RUNNING", "VALIDATING"],
    FAILED: ["READY", "ASSIGNED", "RUNNING", "FAILED"],
  };
  for (const step of path[status] ?? []) {
    task.changeStatus(step as never, later);
  }
  task.clearDomainEvents();
  return task;
}

describe("Task", () => {
  describe("create (§4.6)", () => {
    it("starts PLANNED with an assignee already set — never up for grabs", () => {
      const result = createTask();

      expect(result.isSuccess).toBe(true);
      const task = result.value;
      expect(task.status).toBe("PLANNED");
      expect(task.assignee.actorId).toBe("a-1");
      expect(task.priority).toBe("NORMAL");
      expect(task.repositoryId).toBeNull();
      expect(task.domainEvents[0]?.eventName).toBe("task.created");
    });

    it("stays valid without a repositoryId, and accepts one (§4.24)", () => {
      expect(createTask().value.repositoryId).toBeNull();
      expect(createTask({ repositoryId: "r-1" }).value.repositoryId).toBe("r-1");
    });

    it("requires a goal, a title, an assignee and acceptance criteria", () => {
      expect(createTask({ goalId: "" }).isFailure).toBe(true);
      expect(createTask({ title: " " }).isFailure).toBe(true);
      expect(createTask({ workspaceId: "" }).isFailure).toBe(true);
      const noCriteria = createTask({ acceptanceCriteria: ["  "] });
      expect(noCriteria.isFailure).toBe(true);
      expect(noCriteria.error.name).toBe("EmptyAcceptanceCriteriaError");
    });

    it("refuses an assignee that cannot execute work", () => {
      const worker = ActorRef.create("WORKER", "m-1").value;

      const result = createTask({ assignee: worker });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("IncompatibleAssigneeError");
    });

    it("accepts estimates and keeps them optional", () => {
      const task = createTask({ estimatedCost: 12.5, estimatedDurationMinutes: 90 }).value;

      expect(task.estimatedCost).toBe(12.5);
      expect(task.estimatedDurationMinutes).toBe(90);
      expect(createTask().value.estimatedCost).toBeNull();
    });

    it("rejects negative estimates", () => {
      expect(createTask({ estimatedCost: -1 }).isFailure).toBe(true);
      expect(createTask({ estimatedDurationMinutes: -5 }).isFailure).toBe(true);
    });
  });

  describe("assignment", () => {
    it("reassigns explicitly and raises task.assigned", () => {
      const task = createTask().value;
      task.clearDomainEvents();

      const result = task.assignTo(human, later);

      expect(result.isSuccess).toBe(true);
      expect(task.assignee.actorId).toBe("u-1");
      expect(task.domainEvents[0]?.eventName).toBe("task.assigned");
    });

    it("reassigning to the current assignee is an idempotent no-op", () => {
      const task = createTask().value;
      task.clearDomainEvents();

      expect(task.assignTo(agent, later).isSuccess).toBe(true);
      expect(task.domainEvents).toHaveLength(0);
    });

    it("refuses reassignment on a terminal task, or to a non-executor", () => {
      const cancelled = createTask().value;
      cancelled.changeStatus("CANCELLED", later);
      expect(cancelled.assignTo(human, later).isFailure).toBe(true);

      const worker = ActorRef.create("WORKER", "m-1").value;
      expect(createTask().value.assignTo(worker, later).isFailure).toBe(true);
    });
  });

  describe("state machine (§22.6)", () => {
    it("walks the nominal path", () => {
      const task = createTask().value;

      for (const next of ["READY", "ASSIGNED", "RUNNING", "VALIDATING"] as const) {
        expect(task.changeStatus(next, later).isSuccess).toBe(true);
      }
      expect(task.status).toBe("VALIDATING");
    });

    it("same-state is an idempotent no-op without event", () => {
      const task = createTask().value;
      task.clearDomainEvents();

      expect(task.changeStatus("PLANNED", later).isSuccess).toBe(true);
      expect(task.domainEvents).toHaveLength(0);
    });

    it("COMPLETED is unreachable through changeStatus, even from VALIDATING (§4.24)", () => {
      const task = taskAt("VALIDATING");

      const result = task.changeStatus("COMPLETED", later);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("CompletionRequiresValidationError");
    });

    it("a failed task can be retried, a cancelled one cannot", () => {
      const failed = taskAt("FAILED");
      expect(failed.changeStatus("ASSIGNED", later).isSuccess).toBe(true);

      const cancelled = createTask().value;
      cancelled.changeStatus("CANCELLED", later);
      const result = cancelled.changeStatus("READY", later);
      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("InvalidStateTransitionError");
    });

    it("a rejected review sends the task back to work", () => {
      const task = taskAt("VALIDATING");

      expect(task.changeStatus("RUNNING", later).isSuccess).toBe(true);
    });
  });

  describe("complete", () => {
    it("completes only from VALIDATING", () => {
      const validating = taskAt("VALIDATING");
      expect(validating.complete(later).isSuccess).toBe(true);
      expect(validating.status).toBe("COMPLETED");

      expect(taskAt("RUNNING").complete(later).isFailure).toBe(true);
    });
  });

  describe("blockers (§4.22)", () => {
    it("reporting a blocker blocks the task and remembers where it was", () => {
      const task = taskAt("RUNNING");

      const result = task.reportBlocker(
        { type: "TECHNICAL", description: "port already bound", reportedBy: agent },
        later,
      );

      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe("BLOCKED");
      expect(task.openBlockers).toHaveLength(1);
      expect(task.domainEvents.map((e) => e.eventName)).toContain("task.blocker_reported");
    });

    it("resolving the last open blocker restores the previous status", () => {
      const task = taskAt("RUNNING");
      task.reportBlocker(
        { type: "TECHNICAL", description: "port bound", reportedBy: agent },
        later,
      );
      const blockerId = task.openBlockers[0]!.id;

      const result = task.resolveBlocker(blockerId, "freed the port", later);

      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe("RUNNING");
      expect(task.openBlockers).toHaveLength(0);
      expect(task.blockers[0]?.resolvedAt).toEqual(later);
      expect(task.blockers[0]?.resolution).toBe("freed the port");
    });

    it("stays blocked while another blocker is still open", () => {
      const task = taskAt("RUNNING");
      task.reportBlocker({ type: "TECHNICAL", description: "a", reportedBy: agent }, later);
      task.reportBlocker({ type: "HUMAN", description: "b", reportedBy: agent }, later);
      expect(task.openBlockers).toHaveLength(2);

      task.resolveBlocker(task.openBlockers[0]!.id, "done", later);

      expect(task.status).toBe("BLOCKED");
      expect(task.openBlockers).toHaveLength(1);
    });

    it("a second blocker does not overwrite the remembered status", () => {
      const task = taskAt("RUNNING");
      task.reportBlocker({ type: "TECHNICAL", description: "a", reportedBy: agent }, later);
      task.reportBlocker({ type: "HUMAN", description: "b", reportedBy: agent }, later);

      task.resolveBlocker(task.openBlockers[0]!.id, "x", later);
      task.resolveBlocker(task.openBlockers[0]!.id, "y", later);

      expect(task.status).toBe("RUNNING");
    });

    it("rejects a blocker on a terminal task, an unknown id, and an already-resolved one", () => {
      const cancelled = createTask().value;
      cancelled.changeStatus("CANCELLED", later);
      expect(
        cancelled.reportBlocker(
          { type: "HUMAN", description: "x", reportedBy: agent },
          later,
        ).isFailure,
      ).toBe(true);

      const task = taskAt("RUNNING");
      expect(task.resolveBlocker("ghost", "x", later).isFailure).toBe(true);
      task.reportBlocker({ type: "HUMAN", description: "a", reportedBy: agent }, later);
      const id = task.openBlockers[0]!.id;
      task.resolveBlocker(id, "done", later);
      expect(task.resolveBlocker(id, "again", later).isFailure).toBe(true);
    });

    it("requires a description", () => {
      const task = taskAt("RUNNING");

      expect(
        task.reportBlocker({ type: "HUMAN", description: " ", reportedBy: agent }, later)
          .isFailure,
      ).toBe(true);
    });
  });

  describe("dependencies", () => {
    it("adds and removes, idempotently, refusing self-dependency", () => {
      const task = createTask().value;
      task.clearDomainEvents();

      expect(task.addDependency("t-other", later).isSuccess).toBe(true);
      expect(task.dependsOnTaskIds).toEqual(["t-other"]);
      expect(task.addDependency("t-other", later).isSuccess).toBe(true);
      expect(task.domainEvents).toHaveLength(1);

      expect(task.addDependency(task.id.value, later).isFailure).toBe(true);

      task.removeDependency("t-other", later);
      expect(task.dependsOnTaskIds).toEqual([]);
    });
  });

  describe("updateDetails", () => {
    it("updates the editable fields", () => {
      const task = createTask().value;

      const result = task.updateDetails(
        {
          title: "Renamed",
          acceptanceCriteria: ["only one"],
          priority: "CRITICAL",
          estimatedCost: 3,
          repositoryId: "r-9",
        },
        later,
      );

      expect(result.isSuccess).toBe(true);
      expect(task.title).toBe("Renamed");
      expect(task.acceptanceCriteria).toEqual(["only one"]);
      expect(task.priority).toBe("CRITICAL");
      expect(task.estimatedCost).toBe(3);
      expect(task.repositoryId).toBe("r-9");
    });

    it("refuses empty criteria and edits on a terminal task", () => {
      expect(createTask().value.updateDetails({ acceptanceCriteria: [] }, later).isFailure).toBe(
        true,
      );
      const cancelled = createTask().value;
      cancelled.changeStatus("CANCELLED", later);
      expect(cancelled.updateDetails({ title: "x" }, later).isFailure).toBe(true);
    });
  });

  it("exposes reachable statuses, never COMPLETED (§20.6)", () => {
    expect(taskAt("VALIDATING").allowedStatusTargets()).toEqual([
      "RUNNING",
      "BLOCKED",
      "FAILED",
      "CANCELLED",
    ]);
  });

  it("reconstitute rebuilds without events", () => {
    const task = Task.reconstitute(
      {
        workspaceId: "w-1",
        goalId: "g-1",
        repositoryId: null,
        title: "T",
        description: null,
        acceptanceCriteria: ["c"],
        dependsOnTaskIds: [],
        blockers: [],
        assignee: agent,
        priority: "NORMAL",
        status: "RUNNING",
        statusBeforeBlock: null,
        estimatedCost: null,
        estimatedDurationMinutes: null,
        createdAt: now,
        updatedAt: later,
      },
      "t-1",
    );

    expect(task.id.value).toBe("t-1");
    expect(task.domainEvents).toHaveLength(0);
  });
});

/**
 * Found by the completeness pass: reportBlocker sets BLOCKED directly, so the
 * transition table must admit it from every live state — otherwise
 * allowedStatusTargets() advertises a set that does not match reality.
 */
describe("Task — blocking is honest about the state machine", () => {
  it("a task under validation can be blocked and resumes validating", () => {
    const task = taskAt("VALIDATING");

    task.reportBlocker(
      { type: "APPROVAL", description: "waiting on legal", reportedBy: human },
      later,
    );
    expect(task.status).toBe("BLOCKED");

    task.resolveBlocker(task.openBlockers[0]!.id, "cleared", later);
    expect(task.status).toBe("VALIDATING");
  });

  it("a planned task can be blocked and resumes planned", () => {
    const task = createTask().value;

    task.reportBlocker(
      { type: "EXTERNAL", description: "vendor down", reportedBy: human },
      later,
    );
    task.resolveBlocker(task.openBlockers[0]!.id, "back up", later);

    expect(task.status).toBe("PLANNED");
  });

  it("BLOCKED advertises every state it can restore to", () => {
    const task = taskAt("RUNNING");
    task.reportBlocker({ type: "HUMAN", description: "x", reportedBy: human }, later);

    expect(task.allowedStatusTargets()).toEqual([
      "PLANNED",
      "READY",
      "ASSIGNED",
      "RUNNING",
      "VALIDATING",
      "CANCELLED",
    ]);
  });
});
