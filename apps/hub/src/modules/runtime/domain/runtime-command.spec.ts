import { RuntimeCommand } from "./runtime-command";

const now = new Date("2026-08-05T12:00:00Z");
const later = new Date("2026-08-05T12:30:00Z");
const MINUTE = 60 * 1000;

function enqueued(overrides: Record<string, unknown> = {}) {
  return RuntimeCommand.enqueue({
    workspaceId: "w-1",
    workerId: "n-1",
    type: "ExecuteTask",
    payload: { taskId: "t-1" },
    now,
    ...overrides,
  });
}

describe("RuntimeCommand", () => {
  it("waits in the queue until somebody takes it", () => {
    const command = enqueued().value;

    expect(command.status).toBe("PENDING");
    expect(command.isPending).toBe(true);
    expect(command.claimedBy).toBeNull();
  });

  it("refuses an order with no workspace, worker or type", () => {
    expect(enqueued({ workspaceId: " " }).isFailure).toBe(true);
    expect(enqueued({ workerId: "" }).isFailure).toBe(true);
    expect(enqueued({ type: "  " }).isFailure).toBe(true);
  });

  /** §19.3 will publish Tools with their own orders; an enum would block them. */
  it("accepts an order type it has never heard of", () => {
    expect(enqueued({ type: "InvokeTool:my-extension" }).isSuccess).toBe(true);
  });

  /**
   * §13.7's two paths, which apply to a queue exactly as to a lock — and the
   * test that caught the aggregate letting a second worker steal an order.
   */
  describe("claiming", () => {
    it("is idempotent for the worker that already holds it", () => {
      const command = enqueued().value;
      command.claim("n-1", now);

      expect(command.claim("n-1", later).isSuccess).toBe(true);
      expect(command.claimedAt).toEqual(now);
    });

    it("is refused for a DIFFERENT worker — two runs of one order is the thing a queue prevents", () => {
      const command = enqueued().value;
      command.claim("n-1", now);

      const stolen = command.claim("n-2", later);

      expect(stolen.isFailure).toBe(true);
      expect(stolen.error.name).toBe("CommandAlreadyClaimedError");
      expect(command.claimedBy).toBe("n-1");
    });
  });

  it("carries a result when it completes", () => {
    const command = enqueued().value;
    command.claim("n-1", now);

    expect(command.complete({ exitCode: 0 }, later).isSuccess).toBe(true);
    expect(command.status).toBe("COMPLETED");
    expect(command.result).toEqual({ exitCode: 0 });
    expect(command.finishedAt).toEqual(later);
  });

  it("carries the reason when it fails", () => {
    const command = enqueued().value;
    command.claim("n-1", now);

    command.fail("exit code 3, stderr: no such file", later);

    expect(command.status).toBe("FAILED");
    expect(command.failureReason).toBe("exit code 3, stderr: no such file");
  });

  it("refuses to finish something nobody ever claimed", () => {
    const command = enqueued().value;

    expect(command.complete({}, later).isFailure).toBe(true);
    expect(command.status).toBe("PENDING");
  });

  it("cannot be revived once it is over", () => {
    const command = enqueued().value;
    command.claim("n-1", now);
    command.complete({}, later);

    const result = command.claim("n-2", later);

    expect(result.isFailure).toBe(true);
    // Terminal, and it says so — a finished order is gone, not merely busy.
    expect(result.error.name).toBe("InvalidStateTransitionError");
  });

  /**
   * §6.6 — "aucune tâche ne doit disparaître". An order claimed by a worker
   * that then died must go back to the queue, not to the grave with it.
   */
  it("goes back to the queue when its worker never returns", () => {
    const command = enqueued().value;
    command.claim("n-1", now);

    expect(command.release(later).isSuccess).toBe(true);
    expect(command.status).toBe("PENDING");
    expect(command.claimedBy).toBeNull();
  });

  it("refuses to be released when nobody is holding it", () => {
    const command = enqueued().value;
    command.claim("n-1", now);
    command.complete({}, later);

    expect(command.release(later).isFailure).toBe(true);
  });

  /** §17.7's third monitored resource — the one 0.3.3 was about. */
  it("is stuck once it has been claimed for too long", () => {
    const command = enqueued().value;
    expect(command.isStuckAt(later, MINUTE)).toBe(false); // pending, not stuck

    command.claim("n-1", now);

    expect(command.isStuckAt(new Date(now.getTime() + 30_000), MINUTE)).toBe(false);
    expect(command.isStuckAt(later, MINUTE)).toBe(true);

    command.complete({}, later);
    // A finished order is not stuck — it is done.
    expect(command.isStuckAt(later, MINUTE)).toBe(false);
  });

  it("raises facts the journal can read", () => {
    const command = enqueued().value;
    expect(command.domainEvents[0]?.eventName).toBe("runtime.command_enqueued");

    command.clearDomainEvents();
    command.claim("n-1", now);
    command.fail("nope", later);

    expect(command.domainEvents[0]?.eventName).toBe("runtime.command_finished");
  });
});
