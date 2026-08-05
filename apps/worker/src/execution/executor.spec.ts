import { ExecutorDeps, executeCommand } from "./executor";

function deps(overrides: Partial<ExecutorDeps> = {}): ExecutorDeps {
  return {
    settings: {
      backend: "host",
      containerRuntime: "docker",
      containerImage: "spline/task:1",
      containerMemory: "512m",
      containerCpus: "1",
      containerPids: 256,
      containerUser: "1000:1000",
      allowedCommands: ["git"],
    },
    limits: { timeoutMs: 1000, maxOutputBytes: 10_000 },
    workspaceRoot: "/srv/spline",
    secretsFor: () => ({}),
    supervise: async () => ({
      exitCode: 0,
      stdout: "done",
      stderr: "",
      stoppedBy: null,
    }),
    realpath: (path: string) => path,
    ...overrides,
  };
}

function order(payload: Record<string, unknown> = {}) {
  return {
    id: "cmd-1",
    workspaceId: "w-1",
    type: "ExecuteTask",
    payload: { command: "git", args: ["status"], ...payload },
  };
}

describe("executeCommand", () => {
  it("runs the order and reports what came back", async () => {
    const outcome = await executeCommand(order(), deps());

    expect(outcome.outcome).toBe("COMPLETED");
    expect(outcome.result).toMatchObject({ exitCode: 0, stdout: "done" });
  });

  /**
   * §6.10 — a workspace's work stays in that workspace's directory. The path
   * is derived from the order's workspaceId, never taken from its payload:
   * a payload-supplied root would let one workspace name another's.
   */
  it("derives the working directory from the workspace, never from the payload", async () => {
    const supervise = jest.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
      stoppedBy: null,
    });

    await executeCommand(
      order({ workspaceRoot: "/etc", cwd: "/etc" }),
      deps({ supervise }),
    );

    expect(supervise.mock.calls[0][0].options.cwd).toBe("/srv/spline/w-1");
  });

  it("runs in a subdirectory when the order names one", async () => {
    const supervise = jest.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
      stoppedBy: null,
    });

    await executeCommand(order({ workdir: "repo" }), deps({ supervise }));

    expect(supervise.mock.calls[0][0].options.cwd).toBe("/srv/spline/w-1/repo");
  });

  it("refuses a subdirectory that climbs out of the workspace", async () => {
    const outcome = await executeCommand(order({ workdir: "../w-2" }), deps());

    expect(outcome.outcome).toBe("FAILED");
    expect(outcome.failureReason).toContain("outside");
  });

  /** A non-zero exit is a result, not a crash: the hub decides what it means. */
  it("reports a failing program as a completed order with its exit code", async () => {
    const outcome = await executeCommand(
      order(),
      deps({
        supervise: async () => ({
          exitCode: 3,
          stdout: "",
          stderr: "boom",
          stoppedBy: null,
        }),
      }),
    );

    expect(outcome.outcome).toBe("COMPLETED");
    expect(outcome.result).toMatchObject({ exitCode: 3, stderr: "boom" });
  });

  it("says which limit stopped a task that hit one", async () => {
    const outcome = await executeCommand(
      order(),
      deps({
        supervise: async () => ({
          exitCode: null,
          stdout: "",
          stderr: "",
          stoppedBy: "timeout",
        }),
      }),
    );

    expect(outcome.outcome).toBe("FAILED");
    expect(outcome.failureReason).toContain("timeout");
  });

  describe("what it refuses before running anything", () => {
    it("refuses an order that names no command", async () => {
      const outcome = await executeCommand(
        { ...order(), payload: {} },
        deps(),
      );

      expect(outcome.outcome).toBe("FAILED");
      expect(outcome.failureReason).toContain("command");
    });

    it("refuses a program that is not on this machine's allowlist", async () => {
      const outcome = await executeCommand(order({ command: "curl" }), deps());

      expect(outcome.outcome).toBe("FAILED");
      expect(outcome.failureReason).toContain("curl");
    });

    it("refuses an order type it does not know, rather than guessing", async () => {
      const outcome = await executeCommand(
        { ...order(), type: "SomethingElse" },
        deps(),
      );

      expect(outcome.outcome).toBe("FAILED");
      expect(outcome.failureReason).toContain("SomethingElse");
    });

    /**
     * §18 — the environment is the escape that needs no shell, and it is
     * refused here as well as in `planSpawn`. Both, because the order is
     * attacker-influenced input and this is where it first becomes a plan.
     */
    it("refuses an environment that would load code of its own", async () => {
      const outcome = await executeCommand(
        order({ env: { LD_PRELOAD: "/tmp/evil.so" } }),
        deps(),
      );

      expect(outcome.outcome).toBe("FAILED");
      expect(outcome.failureReason).toContain("LD_PRELOAD");
    });

    it("never runs anything when it refuses", async () => {
      const supervise = jest.fn();

      await executeCommand(order({ command: "curl" }), deps({ supervise }));

      expect(supervise).not.toHaveBeenCalled();
    });
  });

  /**
   * §6.6 — an order must never vanish. Whatever goes wrong, the worker owes
   * the hub an answer.
   */
  it("answers even when running throws", async () => {
    const outcome = await executeCommand(
      order(),
      deps({
        supervise: async () => {
          throw new Error("the runtime is not installed");
        },
      }),
    );

    expect(outcome.outcome).toBe("FAILED");
    expect(outcome.failureReason).toContain("not installed");
  });
});
