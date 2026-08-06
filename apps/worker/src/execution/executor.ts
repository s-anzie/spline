import { ClaimedCommand } from "../hub/hub-client";
import { ensureWorkspaceDirectory } from "./workspace-directory";
import { AgentRunDeps, runAgent } from "../providers/agent-run";
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
  /**
   * §7.9 — makes the workspace's directory. Injected for the same reason
   * `realpath` is: a test about planning should not have to create
   * directories on the machine running it.
   */
  ensureDirectory?: (root: string, workspaceId: string) => string;
  /** §10 — passed through to an agent run; ignored by a plain program. */
  grantFor?: AgentGrantResolver;
  /** §8.3 — passed through to an agent run; a plain program has no branch. */
  checkoutFor?: AgentRunDeps["checkoutFor"];
  /** §8.7 — likewise: what becomes of what the agent wrote. */
  publishFor?: AgentRunDeps["publishFor"];
}

/** §10 — obtains the credential an agent acts with, for one order. */
export type AgentGrantResolver = (
  command: ClaimedCommand,
) => Promise<import("../providers/agent-run").AgentGrant | null>;

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

  /**
   * §7.1 — an order that names a provider is an AGENT run: it carries a
   * prompt rather than a command line, and its answer is a session and a
   * result rather than an exit code alone.
   *
   * Dispatched on the payload rather than on a second order type, because
   * §6.8's types say WHAT to do (execute a task) and not WITH WHAT. A worker
   * that needed `ExecuteTaskWithClaude` would need a new type per provider.
   */
  if (typeof payload.provider === "string" && payload.provider !== "") {
    return runAgent(command, {
      settings: deps.settings,
      limits: deps.limits,
      workspaceRoot: deps.workspaceRoot,
      secretsFor: deps.secretsFor,
      supervise: deps.supervise,
      realpath: deps.realpath,
      ensureDirectory: deps.ensureDirectory,
      grantFor: deps.grantFor,
      checkoutFor: deps.checkoutFor,
      publishFor: deps.publishFor,
    });
  }
  const program = typeof payload.command === "string" ? payload.command : "";
  if (program === "") {
    return failed("this order names no command to run");
  }

  // §7.9 — the directory has to exist before containment can be judged on it.
  const root = (deps.ensureDirectory ?? ensureWorkspaceDirectory)(
    deps.workspaceRoot,
    command.workspaceId,
  );
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
