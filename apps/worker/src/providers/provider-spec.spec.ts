import { providerSpec, PROVIDERS, CLOSED_SURFACE } from "./provider-spec";

describe("provider specs", () => {
  it("knows the providers this worker can drive", () => {
    expect(PROVIDERS).toEqual(["claude", "codex"]);
  });

  it("refuses a provider it does not know, rather than guessing a command line", () => {
    expect(providerSpec("gpt-cli")).toBeNull();
  });

  describe("claude", () => {
    const claude = providerSpec("claude")!;

    it("runs headless and asks for a machine-readable answer", () => {
      const args = claude.startArgs("Review the migration", "sess-1", CLOSED_SURFACE);

      expect(claude.command).toBe("claude");
      expect(args).toContain("-p");
      expect(args).toContain("Review the migration");
      /**
       * §17 — streaming, not a single answer at the end.
       *
       * This asserted `--output-format json` and was right until a run
       * became something an operator watches: `json` prints one object when
       * the process exits, so four minutes of work is four minutes of
       * nothing to look at. `stream-json` prints one per line as it happens,
       * and `--verbose` is what makes the intermediate ones appear at all.
       */
      expect(args.join(" ")).toContain("--output-format stream-json");
      expect(args).toContain("--verbose");
    });

    /**
     * The improvement over capturing the id from the output: `--session-id`
     * lets US name the session, so it exists BEFORE the process starts. A
     * crash between the spawn and the parse then loses nothing — with capture
     * alone, a run that died mid-flight could never be resumed because
     * nobody ever learned what to resume.
     */
    it("assigns the session id rather than discovering it", () => {
      expect(claude.startArgs("go", "sess-1", CLOSED_SURFACE)).toContain("--session-id");
      expect(claude.startArgs("go", "sess-1", CLOSED_SURFACE)).toContain("sess-1");
      expect(claude.assignsSessionId).toBe(true);
    });

    it("resumes by that same id", () => {
      const args = claude.resumeArgs!("Now write the tests", "sess-1", CLOSED_SURFACE);

      expect(args).toContain("--resume");
      expect(args).toContain("sess-1");
      expect(args).toContain("Now write the tests");
    });

    /**
     * §18.5, §18.12 — what the first real run got wrong.
     *
     * Without `--strict-mcp-config` an agent inherits the MCP servers
     * configured on the machine: the operator's personal ones, whatever a
     * project directory declares. A run driven by a poisoned task would reach
     * every one of them.
     */
    describe("what the agent may reach", () => {
      it("inherits nothing from the machine", () => {
        const args = claude.startArgs("go", "sess-1", CLOSED_SURFACE);

        expect(args).toContain("--strict-mcp-config");
        // Nothing listed means nothing configured, so no config is passed.
        expect(args).not.toContain("--mcp-config");
        expect(args).not.toContain("--allowedTools");
      });

      /**
       * A headless run that ASKS is a run that waits until its timeout — how
       * the first real execution here spent its budget requesting `curl`.
       */
      it("never blocks on a permission prompt", () => {
        const args = claude.startArgs("go", "sess-1", CLOSED_SURFACE);
        const mode = args[args.indexOf("--permission-mode") + 1];

        expect(mode).toBe("dontAsk");
      });

      it("opens exactly what it was given, and no more", () => {
        const args = claude.startArgs("go", "sess-1", {
          mcpConfigPath: "/run/w-1/.spline/mcp.json",
          allowedTools: ["mcp__spline__publish_progress"],
        });

        // A PATH, never the JSON: a config in argv is a credential in `ps`.
        expect(args[args.indexOf("--mcp-config") + 1]).toBe(
          "/run/w-1/.spline/mcp.json",
        );
        expect(args[args.indexOf("--allowedTools") + 1]).toBe(
          "mcp__spline__publish_progress",
        );
        // Still strict: an opened door is not an open house.
        expect(args).toContain("--strict-mcp-config");
      });

      it("carries the same isolation into a resume", () => {
        const args = claude.resumeArgs!("go", "sess-1", CLOSED_SURFACE);

        expect(args).toContain("--strict-mcp-config");
        expect(args).toContain("dontAsk");
      });
    });

    it("reads the final answer, the cost and the session out of the envelope", () => {
      const parsed = claude.parse(
        JSON.stringify({
          result: "The migration looks correct.",
          session_id: "sess-1",
          total_cost_usd: 0.0412,
          usage: { input_tokens: 1200, output_tokens: 340 },
        }),
      );

      expect(parsed.isFailure).toBe(false);
      expect(parsed.value).toMatchObject({
        finalText: "The migration looks correct.",
        sessionId: "sess-1",
        cost: 0.0412,
        tokenUsage: { input_tokens: 1200, output_tokens: 340 },
      });
    });

    /**
     * §7.15 — a worker reads what a PROCESS said, never what an agent claims.
     * Output that is not the envelope is a broken run, not a result to guess
     * at: inventing one would hand the hub a fact nobody produced.
     */
    it("refuses output that is not the envelope, rather than inventing a result", () => {
      expect(claude.parse("I am a chatty CLI, not JSON").isFailure).toBe(true);
      expect(claude.parse("").isFailure).toBe(true);
      expect(claude.parse(JSON.stringify({ nope: true })).isFailure).toBe(true);
    });
  });

  describe("codex", () => {
    const codex = providerSpec("codex")!;

    it("runs its non-interactive subcommand, streaming events", () => {
      const args = codex.startArgs("Review the migration", "sess-1", CLOSED_SURFACE);

      expect(codex.command).toBe("codex");
      expect(args.slice(0, 2)).toEqual(["exec", "--json"]);
      expect(args).toContain("Review the migration");
    });

    /**
     * Codex cannot be told its session id — it only reports one. So the id we
     * carry is the one IT chose, captured from the `thread.started` event.
     * The two providers genuinely differ here, and pretending otherwise is
     * how a shared abstraction starts lying.
     */
    /**
     * Codex has no equivalent flags today. Stated as a test so the gap is a
     * known fact rather than an assumption: a surface this cannot narrow is
     * one an operator must know is wide.
     */
    it("cannot narrow its tool surface, and that is recorded rather than faked", () => {
      const args = codex.startArgs("go", "sess-1", {
        mcpConfigPath: "/run/mcp.json",
        allowedTools: ["mcp__spline__x"],
      });

      expect(args).not.toContain("--strict-mcp-config");
      expect(args).not.toContain("--allowedTools");
    });

    it("discovers the session id instead of being given one", () => {
      expect(codex.assignsSessionId).toBe(false);
      expect(codex.startArgs("go", "sess-1", CLOSED_SURFACE)).not.toContain("sess-1");
    });

    /** Resuming is a SUBCOMMAND with different args, not a flag. */
    it("resumes through its own subcommand", () => {
      const args = codex.resumeArgs!("Now write the tests", "thread-9", CLOSED_SURFACE);

      expect(args.slice(0, 3)).toEqual(["exec", "resume", "thread-9"]);
    });

    it("reads the last message and the session out of the event stream", () => {
      const parsed = codex.parse(
        [
          JSON.stringify({ type: "thread.started", thread_id: "thread-9" }),
          JSON.stringify({ type: "item.completed", text: "first" }),
          JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10 } }),
          JSON.stringify({ type: "item.completed", text: "The migration looks correct." }),
        ].join("\n"),
      );

      expect(parsed.isFailure).toBe(false);
      expect(parsed.value).toMatchObject({
        finalText: "The migration looks correct.",
        sessionId: "thread-9",
        tokenUsage: { input_tokens: 10 },
      });
    });

    it("survives a line that is not JSON, because a stream is not a document", () => {
      const parsed = codex.parse(
        [
          "warning: something on stderr's twin",
          JSON.stringify({ type: "thread.started", thread_id: "thread-9" }),
          JSON.stringify({ type: "item.completed", text: "done" }),
        ].join("\n"),
      );

      expect(parsed.isFailure).toBe(false);
      expect(parsed.value?.sessionId).toBe("thread-9");
    });

    it("refuses a stream that never said anything", () => {
      expect(codex.parse("").isFailure).toBe(true);
    });
  });
});
