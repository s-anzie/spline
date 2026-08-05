import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runAgent } from "./agent-run";
import { providerSpec } from "./provider-spec";

/**
 * A REAL process, driven end to end: plan → spawn → supervise → parse.
 *
 * The program is a script NAMED `claude`, placed first on PATH. That detail
 * is the whole design of this file: `runAgent` resolves the provider's
 * program the way it always does, so the entire pipeline is exercised — and
 * the genuine CLI is never invoked.
 *
 * The genuine one must not be. A real run costs tokens against somebody's
 * account, needs a credential, and writes to a filesystem. An earlier version
 * of this test put a script called `fake-claude` on PATH while asking for
 * `claude`, which resolved to the REAL binary and ran a real session. It even
 * passed, for a reason that had nothing to do with what it claimed to check.
 *
 * The last test is the guard against this file drifting into fiction: where
 * the real CLI is installed, it is asked about its own flags — never to run.
 */
/**
 * Captured at module load, before anything prepends the script directory.
 * It was read from `beforeAll` once, which runs AFTER the describe body is
 * evaluated — so the guard below saw an empty PATH and skipped the one test
 * that talks to the genuine CLI. A skipped test reads exactly like a passing
 * one in the summary.
 */
const HOST_PATH = process.env.PATH ?? "";

describe("running an agent for real (integration)", () => {
  let dir: string;
  let workspaceRoot: string;
  let binDir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "spline-agent-"));
    workspaceRoot = realpathSync(dir);
    binDir = join(workspaceRoot, "bin");
    mkdirSync(binDir);
    // Each workspace gets its own directory under the root (§6.10).
    mkdirSync(join(workspaceRoot, "w-1"));

    /**
     * Honours `claude -p <prompt> --output-format json --session-id <id>` and
     * echoes both back, so the test can prove what was actually on the
     * command line rather than trusting the planner that built it.
     */
    writeFileSync(
      join(binDir, "claude"),
      [
        "#!/bin/sh",
        'prompt="$2"',
        'session="$6"',
        '[ "$1" = "-p" ] || { echo "expected -p, got $1" >&2; exit 64; }',
        'printf \'{"result":"saw: %s","session_id":"%s","total_cost_usd":0.01,"usage":{"input_tokens":7}}\\n\' "$prompt" "$session"',
      ].join("\n"),
      { mode: 0o755 },
    );

    process.env.PATH = `${binDir}:${HOST_PATH}`;
  });

  afterAll(() => {
    process.env.PATH = HOST_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  function deps(overrides: Record<string, unknown> = {}) {
    return {
      settings: {
        /**
         * On the host: the container backend would need an image carrying the
         * CLI, which is a packaging question rather than an execution one.
         * Everything else — allowlist, environment rules, containment,
         * timeout — still applies and is what this exercises.
         */
        backend: "host" as const,
        containerRuntime: "docker",
        containerImage: "",
        containerMemory: "512m",
        containerCpus: "1",
        containerPids: 256,
        containerUser: "1000:1000",
        allowedCommands: ["claude"],
      },
      limits: { timeoutMs: 30_000, maxOutputBytes: 100_000 },
      workspaceRoot,
      secretsFor: () => ({}),
      newSessionId: () => "assigned-42",
      ...overrides,
    };
  }

  function order(payload: Record<string, unknown>) {
    return { id: "cmd-1", workspaceId: "w-1", type: "ExecuteTask", payload };
  }

  it("drives a headless CLI end to end and reports what it said", async () => {
    const report = await runAgent(
      order({ provider: "claude", prompt: "Review the migration" }),
      deps(),
    );

    expect(report.outcome).toBe("COMPLETED");
    expect(report.result).toMatchObject({
      // The prompt reached the program as one argument, unsplit.
      finalText: "saw: Review the migration",
      // The id we ASSIGNED travelled the whole way there and back.
      providerSessionId: "assigned-42",
      provider: "claude",
      cost: 0.01,
      exitCode: 0,
    });
  }, 30_000);

  /** §18.1 — the allowlist decides, even for a provider the worker can drive. */
  it("refuses to run a provider the machine does not allow", async () => {
    const report = await runAgent(
      order({ provider: "claude", prompt: "hello" }),
      deps({ settings: { ...deps().settings, allowedCommands: [] } }),
    );

    expect(report.outcome).toBe("FAILED");
    expect(report.failureReason).toContain("claude");
  });

  /** §7.15 — output that is not the envelope is a broken run, never a result. */
  it("fails rather than inventing a result when the CLI answers with prose", async () => {
    writeFileSync(
      join(binDir, "claude"),
      ["#!/bin/sh", 'echo "I am a chatty CLI, not JSON"'].join("\n"),
      { mode: 0o755 },
    );

    const report = await runAgent(
      order({ provider: "claude", prompt: "hello" }),
      deps(),
    );

    expect(report.outcome).toBe("FAILED");
    expect(report.failureReason).toMatch(/envelope/i);
  }, 30_000);

  /**
   * The only test that touches the genuine binary, and it asks rather than
   * runs. Skipped where it is absent, so a contributor without Claude Code
   * does not see a red suite for a machine-shaped reason — and it is what
   * would notice the real CLI renaming a flag underneath us.
   */
  const claudeInstalled = (() => {
    try {
      execFileSync("claude", ["--version"], {
        stdio: "ignore",
        // The script is first on PATH by then; ask the genuine one.
        env: { ...process.env, PATH: HOST_PATH },
      });
      return true;
    } catch {
      return false;
    }
  })();

  (claudeInstalled ? it : it.skip)(
    "agrees with the real CLI about the flags it builds",
    () => {
      const help = execFileSync("claude", ["--help"], {
        encoding: "utf8",
        env: { ...process.env, PATH: HOST_PATH },
      });
      const claude = providerSpec("claude")!;

      // Every flag the spec puts on a command line must be one the CLI knows.
      for (const flag of [
        ...claude.startArgs("x", "y"),
        ...claude.resumeArgs!("x", "y"),
      ].filter((argument) => argument.startsWith("--"))) {
        expect(help).toContain(flag);
      }
    },
    60_000,
  );
});
