import { EntityNotFoundError, InvalidStateTransitionError } from "./errors";

class TaskNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Task", id);
  }
}

describe("kernel errors", () => {
  describe("InvalidStateTransitionError", () => {
    it("describes the entity and the rejected transition", () => {
      const error = new InvalidStateTransitionError("AgentSession", {
        kind: "invalidTransition",
        from: "stopped",
        to: "running",
        fromTerminal: true,
      });

      expect(error.name).toBe("InvalidStateTransitionError");
      expect(error.message).toContain("AgentSession");
      expect(error.message).toContain("stopped");
      expect(error.message).toContain("running");
      expect(error.fromTerminal).toBe(true);
      expect(error.from).toBe("stopped");
      expect(error.to).toBe("running");
    });

    it("does not flag terminal when the source state is not terminal", () => {
      const error = new InvalidStateTransitionError("Task", {
        kind: "invalidTransition",
        from: "planned",
        to: "completed",
        fromTerminal: false,
      });

      expect(error.fromTerminal).toBe(false);
    });
  });

  describe("EntityNotFoundError", () => {
    it("subclasses carry the entity name and id in the message", () => {
      const error = new TaskNotFoundError("t-42");

      expect(error.name).toBe("TaskNotFoundError");
      expect(error.message).toContain("Task");
      expect(error.message).toContain("t-42");
      expect(error.entityName).toBe("Task");
      expect(error.entityId).toBe("t-42");
    });
  });
});
