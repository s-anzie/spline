import { SpawnPlan } from "./spawn-plan";
import { superviseProcess } from "./supervisor";

/**
 * Real processes, on purpose. The limits here are about what a process
 * actually does — refusing to exit, printing without stopping — and a fake
 * child that politely honours a kill would prove the opposite of the point.
 */
function nodePlan(script: string): SpawnPlan {
  return {
    command: process.execPath,
    args: ["-e", script],
    options: { cwd: process.cwd(), env: { PATH: process.env.PATH ?? "" }, shell: false },
  };
}

const generous = { timeoutMs: 10_000, maxOutputBytes: 1_000_000 };

describe("superviseProcess", () => {
  it("reports what an ordinary run said and how it ended", async () => {
    const outcome = await superviseProcess(
      nodePlan("process.stdout.write('done'); process.stderr.write('note')"),
      generous,
    );

    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe("done");
    expect(outcome.stderr).toBe("note");
    expect(outcome.stoppedBy).toBeNull();
  });

  it("carries a non-zero exit code back rather than throwing", async () => {
    const outcome = await superviseProcess(nodePlan("process.exit(3)"), generous);

    expect(outcome.exitCode).toBe(3);
  });

  /**
   * An allowlisted program that never exits holds this worker forever. The
   * program does not have to be malicious for that — a prompt waiting on
   * input it will never get looks exactly the same.
   */
  it("kills a task that outlives its time and says so", async () => {
    const outcome = await superviseProcess(nodePlan("setInterval(() => {}, 1000)"), {
      ...generous,
      timeoutMs: 300,
    });

    expect(outcome.stoppedBy).toBe("timeout");
    expect(outcome.exitCode).not.toBe(0);
  }, 15_000);

  /** A loop that prints is a memory attack that needs no payload. */
  it("stops reading a task that will not stop printing", async () => {
    const outcome = await superviseProcess(
      nodePlan("while (true) { process.stdout.write('x'.repeat(1024)); }"),
      { timeoutMs: 10_000, maxOutputBytes: 4096 },
    );

    expect(outcome.stoppedBy).toBe("output");
    expect(outcome.stdout.length).toBeLessThanOrEqual(4096);
  }, 15_000);

  /**
   * The group, not just the parent: a timeout that leaves the children
   * running is not a timeout. Without `detached` + a negative pid, this
   * grandchild outlives the run holding the worker's privileges.
   */
  it("takes the whole process group with it", async () => {
    const outcome = await superviseProcess(
      nodePlan(
        "const { spawn } = require('node:child_process');" +
          "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });" +
          "process.stdout.write(String(child.pid));" +
          "setInterval(() => {}, 1000);",
      ),
      { ...generous, timeoutMs: 300 },
    );

    expect(outcome.stoppedBy).toBe("timeout");

    // And the grandchild is genuinely gone, which is the actual claim.
    const grandchild = Number(outcome.stdout.trim());
    expect(Number.isInteger(grandchild)).toBe(true);
    await new Promise((done) => setTimeout(done, 200));
    // Signal 0 asks "is this alive?" without sending anything.
    expect(() => process.kill(grandchild, 0)).toThrow();
  }, 15_000);

  /**
   * §6.6 — an order must never vanish. A program that cannot start at all
   * still owes an answer, not an unhandled rejection.
   */
  it("answers even when the program does not exist", async () => {
    const outcome = await superviseProcess(
      { command: "no-such-program-anywhere", args: [], options: nodePlan("").options },
      generous,
    );

    expect(outcome.exitCode).toBeNull();
    expect(outcome.stderr).toContain("failed to start");
  });
});
