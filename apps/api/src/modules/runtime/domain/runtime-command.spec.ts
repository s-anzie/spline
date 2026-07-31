import { RuntimeCommandStatus, RuntimeCommandType } from "@repo/db";

import { RuntimeCommand } from "./runtime-command";
import { InvalidRuntimeCommandStatusTransitionError } from "./runtime-command.errors";

function enqueueCommand() {
  return RuntimeCommand.enqueue({
    machineId: "machine-1",
    workspaceId: "w1",
    type: RuntimeCommandType.START_PROCESS,
    payload: { processId: "process-1" },
  });
}

describe("RuntimeCommand", () => {
  it("enqueues as PENDING", () => {
    const command = enqueueCommand();

    expect(command.status).toBe(RuntimeCommandStatus.PENDING);
    expect(command.completedAt).toBeUndefined();
  });

  it("goes PENDING -> SENT -> ACKNOWLEDGED -> COMPLETED, setting completedAt", () => {
    const command = enqueueCommand();
    const at = new Date("2026-07-31T10:00:00Z");

    command.markSent();
    command.markAcknowledged();
    command.markCompleted(at);

    expect(command.status).toBe(RuntimeCommandStatus.COMPLETED);
    expect(command.completedAt).toEqual(at);
  });

  it("can go straight from SENT to FAILED", () => {
    const command = enqueueCommand();

    command.markSent();
    command.markFailed();

    expect(command.status).toBe(RuntimeCommandStatus.FAILED);
    expect(command.completedAt).toBeDefined();
  });

  it("rejects an invalid transition (e.g. PENDING -> COMPLETED)", () => {
    const command = enqueueCommand();

    expect(() => command.markCompleted()).toThrow(InvalidRuntimeCommandStatusTransitionError);
  });

  it("rejects any transition out of a terminal status", () => {
    const command = enqueueCommand();
    command.markSent();
    command.markCompleted();

    expect(() => command.markFailed()).toThrow(InvalidRuntimeCommandStatusTransitionError);
  });
});
