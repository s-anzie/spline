import { providerSpec, PROVIDERS } from "./provider-spec";

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
      const args = claude.startArgs("Review the migration", "sess-1");

      expect(claude.command).toBe("claude");
      expect(args).toContain("-p");
      expect(args).toContain("Review the migration");
      expect(args.join(" ")).toContain("--output-format json");
    });

    /**
     * The improvement over capturing the id from the output: `--session-id`
     * lets US name the session, so it exists BEFORE the process starts. A
     * crash between the spawn and the parse then loses nothing — with capture
     * alone, a run that died mid-flight could never be resumed because
     * nobody ever learned what to resume.
     */
    it("assigns the session id rather than discovering it", () => {
      expect(claude.startArgs("go", "sess-1")).toContain("--session-id");
      expect(claude.startArgs("go", "sess-1")).toContain("sess-1");
      expect(claude.assignsSessionId).toBe(true);
    });

    it("resumes by that same id", () => {
      const args = claude.resumeArgs!("Now write the tests", "sess-1");

      expect(args).toContain("--resume");
      expect(args).toContain("sess-1");
      expect(args).toContain("Now write the tests");
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
      const args = codex.startArgs("Review the migration", "sess-1");

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
    it("discovers the session id instead of being given one", () => {
      expect(codex.assignsSessionId).toBe(false);
      expect(codex.startArgs("go", "sess-1")).not.toContain("sess-1");
    });

    /** Resuming is a SUBCOMMAND with different args, not a flag. */
    it("resumes through its own subcommand", () => {
      const args = codex.resumeArgs!("Now write the tests", "thread-9");

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
