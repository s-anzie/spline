import { ProcessStatus, RestartPolicy } from "@repo/db";

import { Process } from "./process";
import {
  EmptyProcessCommandError,
  EmptyProcessNameError,
  InvalidProcessStatusTransitionError,
  ProcessMustBeStoppedError,
} from "./process.errors";

function registerProcess() {
  return Process.create({
    workspaceId: "w1",
    name: "Dev server",
    command: "npm run dev",
    cwd: "apps/web",
  });
}

describe("Process", () => {
  it("registers a process with sensible defaults", () => {
    const process = registerProcess();

    expect(process.name).toBe("Dev server");
    expect(process.command).toBe("npm run dev");
    expect(process.status).toBe(ProcessStatus.STOPPED);
    expect(process.restartPolicy).toBe(RestartPolicy.NEVER);
    expect(process.ports).toEqual([]);
    expect(process.pid).toBeUndefined();
  });

  it("records a ProcessRegistered domain event", () => {
    const process = registerProcess();

    expect(process.domainEvents.map((e) => e.eventName)).toEqual(["process.registered"]);
  });

  it("rejects an empty name", () => {
    expect(() =>
      Process.create({ workspaceId: "w1", name: "  ", command: "npm run dev", cwd: "." }),
    ).toThrow(EmptyProcessNameError);
  });

  it("rejects an empty command", () => {
    expect(() =>
      Process.create({ workspaceId: "w1", name: "Dev server", command: "  ", cwd: "." }),
    ).toThrow(EmptyProcessCommandError);
  });

  describe("updateDetails", () => {
    it("updates details while stopped", () => {
      const process = registerProcess();

      process.updateDetails({ command: "npm run dev -- --port 4000" });

      expect(process.command).toBe("npm run dev -- --port 4000");
    });

    it("rejects updates while not stopped", () => {
      const process = registerProcess();
      process.changeStatus(ProcessStatus.STARTING);

      expect(() => process.updateDetails({ command: "echo hi" })).toThrow(ProcessMustBeStoppedError);
    });
  });

  describe("changeStatus", () => {
    it("goes STOPPED -> STARTING -> RUNNING -> STOPPING -> STOPPED", () => {
      const process = registerProcess();
      process.changeStatus(ProcessStatus.STARTING);
      process.changeStatus(ProcessStatus.RUNNING);
      process.changeStatus(ProcessStatus.STOPPING);
      process.changeStatus(ProcessStatus.STOPPED);

      expect(process.status).toBe(ProcessStatus.STOPPED);
    });

    it("clears the pid when transitioning to STOPPED or CRASHED", () => {
      const process = registerProcess();
      process.changeStatus(ProcessStatus.STARTING);
      process.recordPid(1234);
      process.changeStatus(ProcessStatus.RUNNING);
      expect(process.pid).toBe(1234);

      process.changeStatus(ProcessStatus.STOPPING);
      process.changeStatus(ProcessStatus.STOPPED);

      expect(process.pid).toBeUndefined();
    });

    it("allows restarting from CRASHED", () => {
      const process = registerProcess();
      process.changeStatus(ProcessStatus.STARTING);
      process.changeStatus(ProcessStatus.CRASHED);

      process.changeStatus(ProcessStatus.STARTING);

      expect(process.status).toBe(ProcessStatus.STARTING);
    });

    it("rejects an invalid transition", () => {
      const process = registerProcess();

      expect(() => process.changeStatus(ProcessStatus.RUNNING)).toThrow(
        InvalidProcessStatusTransitionError,
      );
    });
  });

  it("records dispatch info (machine + owning session)", () => {
    const process = registerProcess();

    process.recordDispatch("machine-1", "session-1");

    expect(process.machineId).toBe("machine-1");
    expect(process.ownerSessionId).toBe("session-1");
  });
});
