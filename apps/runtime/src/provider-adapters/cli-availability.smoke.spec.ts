import { execFileSync } from "node:child_process";

import { GenericCommandRunner } from "../process-supervisor/generic-command-runner";

/**
 * Real (unmocked) smoke test proving GenericCommandRunner can actually invoke
 * the claude/codex binaries on this machine — not just that our mocks behave.
 * Deliberately limited to `--version` (side-effect-free, no API calls, no cost)
 * per the plan: no automated test launches a real prompted session.
 * Each CLI is skipped gracefully if absent from PATH, so this suite stays
 * green on machines that only have one (or neither) installed.
 */
function isOnPath(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runVersionCheck(binary: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    const runner = new GenericCommandRunner();
    runner.start({
      command: `${binary} --version`,
      cwd: process.cwd(),
      onOutput: (chunk) => {
        output += chunk;
      },
      onExit: (code) => resolve({ code, output }),
    });
  });
}

describe("CLI availability smoke test (real spawn, no mocks)", () => {
  const describeIfPresent = isOnPath("claude") ? describe : describe.skip;
  describeIfPresent("claude", () => {
    it("responds to --version with a real invocation", async () => {
      const { code, output } = await runVersionCheck("claude");
      expect(code).toBe(0);
      expect(output.trim().length).toBeGreaterThan(0);
    }, 15000);
  });

  const describeIfCodexPresent = isOnPath("codex") ? describe : describe.skip;
  describeIfCodexPresent("codex", () => {
    it("responds to --version with a real invocation", async () => {
      const { code, output } = await runVersionCheck("codex");
      expect(code).toBe(0);
      expect(output.trim().length).toBeGreaterThan(0);
    }, 15000);
  });

  if (!isOnPath("claude") && !isOnPath("codex")) {
    it.skip("neither claude nor codex is installed on this machine's PATH", () => {});
  }
});
