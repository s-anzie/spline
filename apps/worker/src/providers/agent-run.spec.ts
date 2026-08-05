import { AgentRunDeps, runAgent } from "./agent-run";

function deps(overrides: Partial<AgentRunDeps> = {}): AgentRunDeps {
  return {
    settings: {
      backend: "host",
      containerRuntime: "docker",
      containerImage: "spline/task:1",
      containerMemory: "512m",
      containerCpus: "1",
      containerPids: 256,
      containerUser: "1000:1000",
      allowedCommands: ["claude", "codex"],
    },
    limits: { timeoutMs: 60_000, maxOutputBytes: 100_000 },
    workspaceRoot: "/srv/spline",
    secretsFor: () => ({ ANTHROPIC_API_KEY: "sk-test" }),
    supervise: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        result: "done",
        session_id: "assigned-1",
        total_cost_usd: 0.02,
      }),
      stderr: "",
      stoppedBy: null,
    }),
    realpath: (path: string) => path,
    // A unit test about planning creates no directories.
    ensureDirectory: (root: string, workspaceId: string) => `${root}/${workspaceId}`,
    newSessionId: () => "assigned-1",
    ...overrides,
  };
}

function order(payload: Record<string, unknown> = {}) {
  return {
    id: "cmd-1",
    workspaceId: "w-1",
    type: "ExecuteTask",
    payload: { provider: "claude", prompt: "Review the migration", ...payload },
  };
}

describe("runAgent", () => {
  it("runs the provider and reports what it said", async () => {
    const report = await runAgent(order(), deps());

    expect(report.outcome).toBe("COMPLETED");
    expect(report.result).toMatchObject({
      finalText: "done",
      providerSessionId: "assigned-1",
      cost: 0.02,
    });
  });

  /**
   * The session id exists BEFORE the process does, so a run that dies between
   * the spawn and the parse can still be resumed. Capturing it from the
   * output alone — the only mechanism OpenClaw has — loses exactly that case.
   */
  it("assigns the session id where the provider accepts one", async () => {
    const supervise = jest.fn().mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ result: "done", session_id: "assigned-1" }),
      stderr: "",
      stoppedBy: null,
    });

    const report = await runAgent(order(), deps({ supervise }));

    expect(supervise.mock.calls[0][0].args).toContain("assigned-1");
    // And it is reported even before the CLI confirms it.
    expect(report.result?.providerSessionId).toBe("assigned-1");
  });

  it("takes the id the provider chose when it cannot be told one", async () => {
    const report = await runAgent(
      order({ provider: "codex" }),
      deps({
        supervise: async () => ({
          exitCode: 0,
          stdout: [
            JSON.stringify({ type: "thread.started", thread_id: "theirs-9" }),
            JSON.stringify({ type: "item.completed", text: "done" }),
          ].join("\n"),
          stderr: "",
          stoppedBy: null,
        }),
      }),
    );

    expect(report.result?.providerSessionId).toBe("theirs-9");
  });

  /** §4.8 (0.3.11) — resuming uses the provider's own resume shape. */
  it("resumes an existing session with the provider's own arguments", async () => {
    const supervise = jest.fn().mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ result: "done", session_id: "sess-7" }),
      stderr: "",
      stoppedBy: null,
    });

    await runAgent(order({ resumeSessionId: "sess-7" }), deps({ supervise }));

    expect(supervise.mock.calls[0][0].args).toContain("--resume");
    expect(supervise.mock.calls[0][0].args).toContain("sess-7");
  });

  /** §18.4 — a task gets the secrets it was granted, and only those. */
  it("gives the run the secrets it was granted", async () => {
    const supervise = jest.fn().mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ result: "done" }),
      stderr: "",
      stoppedBy: null,
    });

    await runAgent(order(), deps({ supervise }));

    expect(supervise.mock.calls[0][0].options.env.ANTHROPIC_API_KEY).toBe("sk-test");
  });

  describe("what it refuses before running anything", () => {
    it("refuses a provider this worker cannot drive", async () => {
      const report = await runAgent(order({ provider: "gpt-cli" }), deps());

      expect(report.outcome).toBe("FAILED");
      expect(report.failureReason).toContain("gpt-cli");
    });

    it("refuses an order with no prompt: there is nothing to ask", async () => {
      const report = await runAgent(order({ prompt: "" }), deps());

      expect(report.outcome).toBe("FAILED");
      expect(report.failureReason).toContain("prompt");
    });

    /**
     * The allowlist still decides, even for a provider this worker knows how
     * to drive. Knowing the shape of a command line is not permission to run
     * it (§18.1).
     */
    it("refuses a provider whose program is not allowed on this machine", async () => {
      const report = await runAgent(
        order(),
        deps({
          settings: { ...deps().settings, allowedCommands: ["codex"] },
        }),
      );

      expect(report.outcome).toBe("FAILED");
      expect(report.failureReason).toContain("claude");
    });
  });

  /**
   * §10, §18.12 — the protocol bridge, and when it is NOT opened.
   */
  describe("the tools an agent is given", () => {
    const grant = {
      token: "grant_abc.secret",
      hubUrl: "http://hub.test",
      serverCommand: "node",
      serverArgs: ["mcp.js"],
    };

    it("opens the bridge when the hub gave this run a credential", async () => {
      const openBridge = jest.fn().mockReturnValue({
        mcpConfigPath: "/run/w-1/.spline/mcp.json",
        allowedTools: ["mcp__spline__synchronize"],
      });
      const supervise = jest.fn().mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ result: "done" }),
        stderr: "",
        stoppedBy: null,
      });

      await runAgent(
        order({ taskId: "t-1" }),
        deps({ grantFor: async () => grant, openBridge, supervise }),
      );

      expect(openBridge.mock.calls[0][0]).toMatchObject({
        taskId: "t-1",
        grantToken: "grant_abc.secret",
      });
      const args = supervise.mock.calls[0][0].args as string[];
      expect(args[args.indexOf("--mcp-config") + 1]).toBe("/run/w-1/.spline/mcp.json");
      expect(args).toContain("mcp__spline__synchronize");
    });

    /**
     * An agent with the tools but no identity would get an authentication
     * error from every one of them, and would report a hub that is "down" —
     * a diagnosis pointing at entirely the wrong thing.
     */
    it("gives no tools at all when there is no credential", async () => {
      const supervise = jest.fn().mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ result: "done" }),
        stderr: "",
        stoppedBy: null,
      });

      await runAgent(order({ taskId: "t-1" }), deps({ supervise }));

      const args = supervise.mock.calls[0][0].args as string[];
      expect(args).not.toContain("--mcp-config");
      expect(args).toContain("--strict-mcp-config");
    });

    it("gives no tools to an order that belongs to no task", async () => {
      const openBridge = jest.fn();
      const supervise = jest.fn().mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ result: "done" }),
        stderr: "",
        stoppedBy: null,
      });

      await runAgent(order(), deps({ grantFor: async () => grant, openBridge, supervise }));

      expect(openBridge).not.toHaveBeenCalled();
    });

    /** §18.4 — the credential is never on the command line. */
    it("never puts the grant on the command line", async () => {
      const supervise = jest.fn().mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ result: "done" }),
        stderr: "",
        stoppedBy: null,
      });

      await runAgent(
        order({ taskId: "t-1" }),
        deps({
          grantFor: async () => grant,
          openBridge: () => ({
            mcpConfigPath: "/run/mcp.json",
            allowedTools: [],
          }),
          supervise,
        }),
      );

      expect((supervise.mock.calls[0][0].args as string[]).join(" ")).not.toContain(
        "grant_abc.secret",
      );
    });
  });

  /**
   * §7.15 — a worker reads what a PROCESS said. Output that is not the
   * envelope is a broken run, and inventing a result would hand the hub a
   * fact nobody produced.
   */
  it("fails rather than inventing a result from unreadable output", async () => {
    const report = await runAgent(
      order(),
      deps({
        supervise: async () => ({
          exitCode: 0,
          stdout: "I am a chatty CLI",
          stderr: "",
          stoppedBy: null,
        }),
      }),
    );

    expect(report.outcome).toBe("FAILED");
    expect(report.failureReason).toMatch(/envelope|read/i);
  });

  it("says which limit stopped a run that hit one", async () => {
    const report = await runAgent(
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

    expect(report.outcome).toBe("FAILED");
    expect(report.failureReason).toContain("timeout");
  });

  /**
   * A non-zero exit with a readable envelope is still a result: the agent ran
   * and said something. What it means is the hub's to decide (§6.9).
   */
  it("carries a non-zero exit back with whatever was said", async () => {
    const report = await runAgent(
      order(),
      deps({
        supervise: async () => ({
          exitCode: 1,
          stdout: JSON.stringify({ result: "I could not do it", session_id: "s-1" }),
          stderr: "",
          stoppedBy: null,
        }),
      }),
    );

    expect(report.outcome).toBe("COMPLETED");
    expect(report.result).toMatchObject({ exitCode: 1, finalText: "I could not do it" });
  });
});
