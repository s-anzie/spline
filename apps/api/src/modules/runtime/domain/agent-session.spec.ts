import { AgentSessionStatus, ApprovalState } from "@repo/db";

import { AgentSession } from "./agent-session";
import { InvalidAgentSessionStatusTransitionError } from "./agent-session.errors";

function startSession() {
  return AgentSession.start({
    agentId: "agent-1",
    provider: "claude",
    workspaceId: "w1",
    machineId: "machine-1",
  });
}

describe("AgentSession", () => {
  it("starts with sensible defaults", () => {
    const session = startSession();

    expect(session.status).toBe(AgentSessionStatus.STARTING);
    expect(session.approvalState).toBe(ApprovalState.NOT_REQUIRED);
    expect(session.currentProcessId).toBeUndefined();
    expect(session.currentTaskId).toBeUndefined();
    expect(session.endedAt).toBeUndefined();
    expect(session.isTerminal).toBe(false);
  });

  it("records an AgentSessionStarted domain event", () => {
    const session = startSession();

    expect(session.domainEvents.map((e) => e.eventName)).toEqual(["agent_session.started"]);
  });

  describe("changeStatus", () => {
    it("goes STARTING -> RUNNING -> AWAITING_APPROVAL -> RUNNING -> COMPLETED", () => {
      const session = startSession();
      session.changeStatus(AgentSessionStatus.RUNNING);
      session.changeStatus(AgentSessionStatus.AWAITING_APPROVAL);
      session.changeStatus(AgentSessionStatus.RUNNING);
      session.changeStatus(AgentSessionStatus.COMPLETED);

      expect(session.status).toBe(AgentSessionStatus.COMPLETED);
    });

    it("sets endedAt when reaching a terminal status", () => {
      const session = startSession();
      const at = new Date("2026-07-31T10:00:00Z");

      session.changeStatus(AgentSessionStatus.RUNNING);
      session.changeStatus(AgentSessionStatus.COMPLETED, at);

      expect(session.endedAt).toEqual(at);
    });

    it("rejects an invalid transition", () => {
      const session = startSession();

      expect(() => session.changeStatus(AgentSessionStatus.COMPLETED)).toThrow(
        InvalidAgentSessionStatusTransitionError,
      );
    });

    it("rejects any transition out of a terminal status", () => {
      const session = startSession();
      session.changeStatus(AgentSessionStatus.RUNNING);
      session.changeStatus(AgentSessionStatus.COMPLETED);

      expect(() => session.changeStatus(AgentSessionStatus.RUNNING)).toThrow(
        InvalidAgentSessionStatusTransitionError,
      );
    });
  });

  describe("setApprovalState", () => {
    it("changes approval state and records the event", () => {
      const session = startSession();

      session.setApprovalState(ApprovalState.PENDING);

      expect(session.approvalState).toBe(ApprovalState.PENDING);
      expect(session.domainEvents.map((e) => e.eventName)).toEqual([
        "agent_session.started",
        "agent_session.approval_state_changed",
      ]);
    });

    it("is a no-op when setting the same approval state again", () => {
      const session = startSession();
      session.setApprovalState(ApprovalState.PENDING);
      session.clearEvents();

      session.setApprovalState(ApprovalState.PENDING);

      expect(session.domainEvents).toEqual([]);
    });
  });

  describe("process/task pointers", () => {
    it("assigns and clears the current process", () => {
      const session = startSession();

      session.assignProcess("process-1");
      expect(session.currentProcessId).toBe("process-1");

      session.clearProcess();
      expect(session.currentProcessId).toBeUndefined();
    });

    it("assigns and clears the current task", () => {
      const session = startSession();

      session.assignTask("task-1");
      expect(session.currentTaskId).toBe("task-1");

      session.clearTask();
      expect(session.currentTaskId).toBeUndefined();
    });
  });

  describe("isStale", () => {
    it("is never stale once terminal", () => {
      const session = startSession();
      session.changeStatus(AgentSessionStatus.RUNNING);
      session.changeStatus(AgentSessionStatus.COMPLETED);

      expect(session.isStale(new Date("2099-01-01"), 1000)).toBe(false);
    });

    it("is stale once past the TTL since its last heartbeat (or start)", () => {
      const startedAt = new Date("2026-07-31T10:00:00Z");
      const session = AgentSession.start(
        { agentId: "agent-1", provider: "claude", workspaceId: "w1", machineId: "machine-1" },
        startedAt,
      );

      expect(session.isStale(new Date("2026-07-31T10:00:30Z"), 60_000)).toBe(false);
      expect(session.isStale(new Date("2026-07-31T10:01:01Z"), 60_000)).toBe(true);

      session.recordHeartbeat(new Date("2026-07-31T10:01:01Z"));
      expect(session.isStale(new Date("2026-07-31T10:01:31Z"), 60_000)).toBe(false);
    });
  });
});
