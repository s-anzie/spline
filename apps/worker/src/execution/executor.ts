import { join } from "node:path";

import { ClaimedCommand } from "../hub/hub-client";
import { ExecutionSettings, planExecution } from "../supervision/execution";
import { ExecutionLimits, ExecutionOutcome, superviseProcess } from "../supervision/supervisor";
import { SpawnPlan } from "../supervision/spawn-plan";

export interface ExecutorDeps {
  settings: ExecutionSettings;
  limits: ExecutionLimits;
  /**
   * The root under which every workspace gets its own directory. A workspace
   * never names its own root (§6.10): one that could would be naming another's.
   */
  workspaceRoot: string;
  /** §18.4 — only what this task was granted, resolved by the caller. */
  secretsFor: (command: ClaimedCommand) => Record<string, string>;
  supervise?: (
    plan: SpawnPlan,
    limits: ExecutionLimits,
  ) => Promise<ExecutionOutcome>;
  realpath?: (path: string) => string;
}

export interface CommandReport {
  outcome: "COMPLETED" | "FAILED";
  result?: Record<string, unknown>;
  failureReason?: string;
}

/**
 * The order types this worker knows how to carry out. Anything else is
 * refused by name rather than guessed at: §6.8 lets an Engine or an Extension
 * add its own, and a worker that tried to interpret an unknown one would be
 * inventing a contract.
 */
const RUNNABLE_TYPES = new Set(["ExecuteTask", "InvokeTool", "CreateWorktree"]);

function failed(reason: string): CommandReport {
  return { outcome: "FAILED", failureReason: reason };
}

/**
 * §6.8 — turns one claimed order into one answer.
 *
 * Always answers. Whatever is wrong with an order, or with running it, the
 * hub gets a report: §6.6 says no task may disappear, and an order the worker
 * swallowed is a task that disappeared.
 *
 * The payload is attacker-influenced input — an agent's text reached it
 * somewhere upstream — so nothing in it is trusted with anything structural.
 * The workspace directory is derived from the order's workspaceId, the
 * program is checked against this machine's allowlist, and the environment
 * goes through the same refusals as any other spawn.
 */
export async function executeCommand(
  command: ClaimedCommand,
  deps: ExecutorDeps,
): Promise<CommandReport> {
  if (!RUNNABLE_TYPES.has(command.type)) {
    return failed(
      `this worker does not know how to carry out "${command.type}" (§6.8)`,
    );
  }

  const payload = command.payload;
  const program = typeof payload.command === "string" ? payload.command : "";
  if (program === "") {
    return failed("this order names no command to run");
  }

  const root = join(deps.workspaceRoot, command.workspaceId);
  const workdir = typeof payload.workdir === "string" ? payload.workdir : ".";

  const plan = planExecution(
    {
      command: program,
      args: Array.isArray(payload.args) ? payload.args.map(String) : [],
      workspaceRoot: root,
      cwd: workdir,
      env: asStringMap(payload.env),
      secrets: deps.secretsFor(command),
      realpath: deps.realpath,
    },
    deps.settings,
  );
  if (plan.isFailure) {
    return failed(plan.error);
  }

  let outcome: ExecutionOutcome;
  try {
    outcome = await (deps.supervise ?? superviseProcess)(plan.value, deps.limits);
  } catch (error) {
    // A runtime that is missing, a directory that vanished: still an answer.
    return failed(`could not run this order: ${String(error)}`);
  }

  if (outcome.stoppedBy !== null) {
    return failed(
      `stopped by the ${outcome.stoppedBy} limit after ${describeLimit(outcome.stoppedBy, deps.limits)}`,
    );
  }

  /**
   * A non-zero exit is a RESULT, not a failure of the order: the program ran,
   * it said what it had to say, and what that means is the hub's to decide
   * (§6.9). Reporting it as FAILED would lose the exit code and the output.
   */
  return {
    outcome: "COMPLETED",
    result: {
      exitCode: outcome.exitCode,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
    },
  };
}

function describeLimit(
  limit: NonNullable<ExecutionOutcome["stoppedBy"]>,
  limits: ExecutionLimits,
): string {
  return limit === "timeout"
    ? `${limits.timeoutMs}ms`
    : `${limits.maxOutputBytes} bytes of output`;
}

function asStringMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "string")
    .map(([key, item]) => [key, item as string] as const);
  return Object.fromEntries(entries);
}
