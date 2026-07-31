import { AgentHealthState, AgentStatus } from "@repo/db";

import { Agent } from "./agent";
import {
  EmptyAgentDisplayNameError,
  EmptyAgentProviderError,
  InvalidAgentStatusTransitionError,
} from "./agent.errors";

function registerAgent() {
  return Agent.create({
    workspaceId: "workspace-1",
    provider: "claude",
    displayName: "Claude worker #1",
  });
}

describe("Agent", () => {
  it("registers an agent with sensible defaults", () => {
    const agent = registerAgent();

    expect(agent.provider).toBe("claude");
    expect(agent.displayName).toBe("Claude worker #1");
    expect(agent.status).toBe(AgentStatus.OFFLINE);
    expect(agent.healthState).toBe(AgentHealthState.UNKNOWN);
    expect(agent.capabilities).toEqual([]);
    expect(agent.permissions).toEqual([]);
    expect(agent.promptProfile).toEqual({});
    expect(agent.currentTaskId).toBeUndefined();
    expect(agent.lastSeenAt).toBeUndefined();
  });

  it("records an AgentRegistered domain event", () => {
    const agent = registerAgent();

    expect(agent.domainEvents.map((e) => e.eventName)).toEqual(["agent.registered"]);
  });

  it("rejects an empty provider", () => {
    expect(() =>
      Agent.create({ workspaceId: "w1", provider: "  ", displayName: "Name" }),
    ).toThrow(EmptyAgentProviderError);
  });

  it("rejects an empty display name", () => {
    expect(() =>
      Agent.create({ workspaceId: "w1", provider: "claude", displayName: "  " }),
    ).toThrow(EmptyAgentDisplayNameError);
  });

  it("updates its details", () => {
    const agent = registerAgent();

    agent.updateDetails({ displayName: "Renamed", capabilities: ["code_edit"], permissions: ["read_files"] });

    expect(agent.displayName).toBe("Renamed");
    expect(agent.capabilities).toEqual(["code_edit"]);
    expect(agent.permissions).toEqual(["read_files"]);
  });

  it("rejects renaming to an empty display name", () => {
    const agent = registerAgent();

    expect(() => agent.updateDetails({ displayName: "   " })).toThrow(EmptyAgentDisplayNameError);
  });

  describe("changeStatus", () => {
    it("goes OFFLINE -> ONLINE and records lastSeenAt", () => {
      const agent = registerAgent();
      const now = new Date("2026-07-31T10:00:00Z");

      agent.changeStatus(AgentStatus.ONLINE, now);

      expect(agent.status).toBe(AgentStatus.ONLINE);
      expect(agent.lastSeenAt).toEqual(now);
      expect(agent.domainEvents.map((e) => e.eventName)).toEqual([
        "agent.registered",
        "agent.status_changed",
      ]);
    });

    it("goes ONLINE -> BUSY -> ONLINE -> OFFLINE", () => {
      const agent = registerAgent();
      agent.changeStatus(AgentStatus.ONLINE);
      agent.changeStatus(AgentStatus.BUSY);
      agent.changeStatus(AgentStatus.ONLINE);
      agent.changeStatus(AgentStatus.OFFLINE);

      expect(agent.status).toBe(AgentStatus.OFFLINE);
    });

    it("does not update lastSeenAt on a transition to OFFLINE", () => {
      const agent = registerAgent();
      const onlineAt = new Date("2026-07-31T10:00:00Z");
      agent.changeStatus(AgentStatus.ONLINE, onlineAt);

      agent.changeStatus(AgentStatus.OFFLINE, new Date("2026-07-31T11:00:00Z"));

      expect(agent.lastSeenAt).toEqual(onlineAt);
    });

    it("rejects an invalid transition (e.g. OFFLINE -> BUSY)", () => {
      const agent = registerAgent();

      expect(() => agent.changeStatus(AgentStatus.BUSY)).toThrow(InvalidAgentStatusTransitionError);
    });

    it("rejects a same-status transition", () => {
      const agent = registerAgent();
      agent.changeStatus(AgentStatus.ONLINE);

      expect(() => agent.changeStatus(AgentStatus.ONLINE)).toThrow(InvalidAgentStatusTransitionError);
    });

    it("rejects transitions out of a terminal-ish loop incorrectly, e.g. ERROR -> BUSY", () => {
      const agent = registerAgent();
      agent.changeStatus(AgentStatus.ONLINE);
      agent.changeStatus(AgentStatus.ERROR);

      expect(() => agent.changeStatus(AgentStatus.BUSY)).toThrow(InvalidAgentStatusTransitionError);
    });
  });

  describe("updateHealth", () => {
    it("changes health and records an event", () => {
      const agent = registerAgent();

      agent.updateHealth(AgentHealthState.HEALTHY);

      expect(agent.healthState).toBe(AgentHealthState.HEALTHY);
      expect(agent.domainEvents.map((e) => e.eventName)).toEqual([
        "agent.registered",
        "agent.health_changed",
      ]);
    });

    it("is a no-op (no event) when reporting the same health value again", () => {
      const agent = registerAgent();
      agent.updateHealth(AgentHealthState.HEALTHY);
      agent.clearEvents();

      agent.updateHealth(AgentHealthState.HEALTHY);

      expect(agent.domainEvents).toEqual([]);
    });
  });

  describe("task assignment", () => {
    it("assigns and unassigns a task", () => {
      const agent = registerAgent();

      agent.assignToTask("task-1");
      expect(agent.currentTaskId).toBe("task-1");

      agent.unassignFromTask();
      expect(agent.currentTaskId).toBeUndefined();

      expect(agent.domainEvents.map((e) => e.eventName)).toEqual([
        "agent.registered",
        "agent.assigned_to_task",
        "agent.unassigned_from_task",
      ]);
    });

    it("is a no-op when unassigning with no current task", () => {
      const agent = registerAgent();
      agent.clearEvents();

      agent.unassignFromTask();

      expect(agent.domainEvents).toEqual([]);
    });
  });

  it("recordHeartbeat updates lastSeenAt without changing status or recording an event", () => {
    const agent = registerAgent();
    agent.changeStatus(AgentStatus.ONLINE);
    agent.clearEvents();
    const heartbeatAt = new Date("2026-07-31T12:00:00Z");

    agent.recordHeartbeat(heartbeatAt);

    expect(agent.lastSeenAt).toEqual(heartbeatAt);
    expect(agent.status).toBe(AgentStatus.ONLINE);
    expect(agent.domainEvents).toEqual([]);
  });
});
