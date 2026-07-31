import { LocalMachineRuntimeStatus } from "@repo/db";

import { LocalMachine } from "./local-machine";
import {
  EmptyMachineHostnameError,
  InvalidMachineRuntimeStatusTransitionError,
} from "./local-machine.errors";

function registerMachine() {
  return LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
}

describe("LocalMachine", () => {
  it("registers with sensible defaults and no domain events (no workspace audience yet)", () => {
    const machine = registerMachine();

    expect(machine.hostname).toBe("bradley-dev");
    expect(machine.os).toBe("linux");
    expect(machine.workspaceIds).toEqual([]);
    expect(machine.runtimeStatus).toBe(LocalMachineRuntimeStatus.OFFLINE);
    expect(machine.domainEvents).toEqual([]);
  });

  it("rejects an empty hostname", () => {
    expect(() => LocalMachine.register({ hostname: "  ", os: "linux" })).toThrow(
      EmptyMachineHostnameError,
    );
  });

  describe("linkToWorkspace", () => {
    it("links a workspace and records the event", () => {
      const machine = registerMachine();

      machine.linkToWorkspace("w1");

      expect(machine.workspaceIds).toEqual(["w1"]);
      expect(machine.domainEvents.map((e) => e.eventName)).toEqual([
        "local_machine.linked_to_workspace",
      ]);
    });

    it("is idempotent when linking the same workspace twice", () => {
      const machine = registerMachine();
      machine.linkToWorkspace("w1");
      machine.clearEvents();

      machine.linkToWorkspace("w1");

      expect(machine.workspaceIds).toEqual(["w1"]);
      expect(machine.domainEvents).toEqual([]);
    });
  });

  describe("changeRuntimeStatus", () => {
    it("goes OFFLINE -> ONLINE and sets lastSeenAt", () => {
      const machine = registerMachine();
      const now = new Date("2026-07-31T10:00:00Z");

      machine.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE, now);

      expect(machine.runtimeStatus).toBe(LocalMachineRuntimeStatus.ONLINE);
      expect(machine.lastSeenAt).toEqual(now);
    });

    it("rejects an invalid transition (e.g. OFFLINE -> DEGRADED)", () => {
      const machine = registerMachine();

      expect(() => machine.changeRuntimeStatus(LocalMachineRuntimeStatus.DEGRADED)).toThrow(
        InvalidMachineRuntimeStatusTransitionError,
      );
    });

    it("emits one event per linked workspace", () => {
      const machine = registerMachine();
      machine.linkToWorkspace("w1");
      machine.linkToWorkspace("w2");
      machine.clearEvents();

      machine.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE);

      expect(machine.domainEvents.map((e) => e.workspaceId).sort()).toEqual(["w1", "w2"]);
      expect(machine.domainEvents.every((e) => e.eventName === "local_machine.runtime_status_changed")).toBe(
        true,
      );
    });

    it("emits no event when there is no linked workspace", () => {
      const machine = registerMachine();

      machine.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE);

      expect(machine.domainEvents).toEqual([]);
    });
  });

  describe("isStale", () => {
    it("is never stale while OFFLINE", () => {
      const machine = registerMachine();

      expect(machine.isStale(new Date("2099-01-01"), 1000)).toBe(false);
    });

    it("is stale once past the TTL since its last signal", () => {
      const machine = registerMachine();
      const onlineAt = new Date("2026-07-31T10:00:00Z");
      machine.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE, onlineAt);

      expect(machine.isStale(new Date("2026-07-31T10:00:30Z"), 60_000)).toBe(false);
      expect(machine.isStale(new Date("2026-07-31T10:01:01Z"), 60_000)).toBe(true);
    });
  });
});
