import { spawn, ChildProcess } from "node:child_process";

import { SpawnPlan } from "./spawn-plan";

export interface ExecutionLimits {
  /** How long a task may run before it is killed. */
  timeoutMs: number;
  /**
   * How much output is kept and reported. Not a hint: the read stops there.
   * An agent that loops printing is otherwise a memory exhaustion attack
   * against the machine that trusted it — the "resource and state" class in
   * the published analysis of OpenClaw, and the one that needs no payload.
   */
  maxOutputBytes: number;
}

export interface ExecutionOutcome {
  /** null when the process was killed rather than exiting on its own. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Set when a limit ended the run, naming which one. */
  stoppedBy: "timeout" | "output" | null;
}

/** Injected so a test can prove the kill path without a real process. */
export type Spawner = (plan: SpawnPlan) => ChildProcess;

const defaultSpawner: Spawner = (plan) =>
  spawn(plan.command, plan.args, {
    ...plan.options,
    stdio: ["ignore", "pipe", "pipe"],
    /**
     * Its own process group, so killing the task kills what it started.
     * Without this, a program that forks leaves its children running with the
     * worker's privileges after the task is declared finished — the
     * persistence half of the OpenClaw findings, and the reason a timeout
     * that only kills the parent is not a timeout.
     */
    detached: true,
  });

/**
 * Runs a planned command under limits, and always resolves.
 *
 * §7.9 and §18.1 — `planSpawn` decides WHAT may run and WHERE; this decides
 * for HOW LONG and HOW MUCH. Both are needed: an allowlisted program that
 * never exits holds this worker forever, and one that prints without stopping
 * exhausts the machine. Neither requires the program to be malicious, which
 * is exactly why neither can be left to good behaviour.
 *
 * stdin is closed rather than inherited: a task has nothing to ask the
 * operator, and a process waiting on a terminal that will never answer is a
 * hang that looks like work.
 */
export async function superviseProcess(
  plan: SpawnPlan,
  limits: ExecutionLimits,
  spawner: Spawner = defaultSpawner,
): Promise<ExecutionOutcome> {
  const child = spawner(plan);

  let stdout = "";
  let stderr = "";
  let stoppedBy: ExecutionOutcome["stoppedBy"] = null;
  let settled = false;

  const stop = (reason: NonNullable<ExecutionOutcome["stoppedBy"]>): void => {
    if (settled) {
      return;
    }
    stoppedBy = reason;
    kill(child);
  };

  const collect = (
    stream: NodeJS.ReadableStream | null,
    append: (chunk: string) => void,
  ): void => {
    stream?.setEncoding("utf8");
    stream?.on("data", (chunk: string) => {
      append(chunk);
      if (stdout.length + stderr.length >= limits.maxOutputBytes) {
        stop("output");
      }
    });
  };
  collect(child.stdout, (chunk) => {
    stdout = truncate(stdout + chunk, limits.maxOutputBytes);
  });
  collect(child.stderr, (chunk) => {
    stderr = truncate(stderr + chunk, limits.maxOutputBytes);
  });

  const timer = setTimeout(() => {
    stop("timeout");
  }, limits.timeoutMs);
  // A pending timer must not be the reason this process stays alive.
  timer.unref?.();

  const exitCode = await new Promise<number | null>((resolve) => {
    const finish = (code: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(code);
    };
    child.on("close", finish);
    // A spawn that fails (program missing, cwd gone) never emits "close".
    // Reported as a failure rather than an unhandled rejection: §6.6 forbids
    // an order that quietly disappears.
    child.on("error", () => {
      stderr = truncate(`${stderr}\nfailed to start`, limits.maxOutputBytes);
      finish(null);
    });
  });

  return { exitCode, stdout, stderr, stoppedBy };
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) : text;
}

/**
 * The whole group, and SIGKILL after a grace period: a task that ignores
 * SIGTERM must not be able to outlive its own timeout by ignoring it.
 */
function kill(child: ChildProcess): void {
  const target = child.pid;
  if (target === undefined) {
    return;
  }
  signal(target, "SIGTERM");
  const hard = setTimeout(() => {
    signal(target, "SIGKILL");
  }, 5_000);
  hard.unref?.();
  child.on("close", () => {
    clearTimeout(hard);
  });
}

function signal(pid: number, name: NodeJS.Signals): void {
  try {
    // Negative pid addresses the group `detached: true` created.
    process.kill(-pid, name);
  } catch {
    // Already gone, which is the outcome we wanted anyway.
  }
}
