import { randomUUID } from "node:crypto";
import { CommandReport } from "../execution/executor";
import { ensureWorkspaceDirectory } from "../execution/workspace-directory";
import { ClaimedCommand } from "../hub/hub-client";
import { ExecutionSettings, planExecution } from "../supervision/execution";
import {
  ExecutionLimits,
  ExecutionOutcome,
  superviseProcess,
} from "../supervision/supervisor";
import { writeMcpBridge } from "../mcp/mcp-config";
import { Checkout, CheckoutResult } from "../git/checkout";
import { TraceEntry, TraceReader } from "./trace";
import { CLOSED_SURFACE, providerSpec } from "./provider-spec";

/** What `publishWork` answers, kept here so this file owns no git. */
export interface PublishedSummary {
  changed: boolean;
  conflict: string | null;
}

/** §10 — what a run needs to open the protocol bridge. */
export interface AgentGrant {
  token: string;
  hubUrl: string;
  serverCommand: string;
  serverArgs: readonly string[];
  /**
   * What the hub decided this agent may do, as the intersection of the
   * protocol's scopes with its role. Carried down so the bridge offers only
   * those tools — a manager sees `cut_task`, a contributor does not.
   */
  scopes?: readonly string[];
}

export interface AgentRunDeps {
  settings: ExecutionSettings;
  limits: ExecutionLimits;
  workspaceRoot: string;
  /** §18.4 — only what this task was granted. */
  secretsFor: (command: ClaimedCommand) => Record<string, string>;
  /**
   * Typed as the real `superviseProcess` is, including the watcher: a
   * narrower type here would have let a caller pass a supervisor that
   * silently ignores the stream, and the trace would be empty with nothing
   * saying why.
   */
  supervise?: typeof superviseProcess;
  realpath?: (path: string) => string;
  /** Injected so a test can say which id was assigned. */
  newSessionId?: () => string;
  /**
   * §10, §18.10 — obtains the task grant this run acts with. Absent means no
   * bridge: an agent that cannot identify itself is given no tools rather
   * than tools that will all fail.
   */
  grantFor?: (command: ClaimedCommand) => Promise<AgentGrant | null>;
  /** Injected so a test needs no filesystem to prove what is passed. */
  openBridge?: typeof writeMcpBridge;
  /**
   * §17 — called as the agent speaks and reaches for tools, so a caller can
   * report progress while there is still something to report on.
   */
  onProgress?: (entry: TraceEntry) => void;
  /**
   * §8.3 — prepares the repository checkout this order names, if it names
   * one. Absent, or answering null, means the agent works in the workspace
   * directory with no branch — which is what every task did before this.
   */
  checkoutFor?: (command: ClaimedCommand) => Promise<CheckoutResult | null>;
  /**
   * §8.7 — records and pushes what the agent left behind, and says whether
   * catching up hit a conflict. Only called when there was a checkout.
   */
  publishFor?: (
    command: ClaimedCommand,
    checkout: Checkout,
  ) => Promise<PublishedSummary | null>;
  /**
   * §7.9 — makes the workspace's directory. Injected for the same reason
   * `realpath` is: a test about planning should not have to create
   * directories on the machine running it.
   */
  ensureDirectory?: (root: string, workspaceId: string) => string;
}

function failed(reason: string): CommandReport {
  return { outcome: "FAILED", failureReason: reason };
}

/**
 * §7.1, §4.8 — runs a coding agent and brings back what it said.
 *
 * This is the piece that turns "run a program in a container" into "run an
 * agent": the prompt, the provider's own command line, the session identity,
 * and a machine-readable answer.
 *
 * Everything the boundary already enforces still applies — the allowlist, the
 * environment rules, the workspace containment, the timeout, the container.
 * Knowing how to build a provider's command line is not permission to run it
 * (§18.1), and this passes through `planExecution` exactly like any other
 * order.
 *
 * Two things it reads and never interprets (§7.15): the final text, which is
 * the agent's, and the session id, which is the CLI's. Nothing downstream
 * decides anything from either — an agent that wrote "429" in its answer
 * still cannot lock a provider out (0.3.8).
 */
export async function runAgent(
  command: ClaimedCommand,
  deps: AgentRunDeps,
): Promise<CommandReport> {
  const payload = command.payload;
  const providerName = typeof payload.provider === "string" ? payload.provider : "";
  const spec = providerSpec(providerName);
  if (!spec) {
    return failed(
      `this worker cannot drive "${providerName || "(none named)"}" — it knows claude and codex (§4.14)`,
    );
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (prompt === "") {
    return failed("this order carries no prompt, so there is nothing to ask");
  }

  /**
   * §4.8 — the session id, decided here when the provider accepts one.
   *
   * Assigning beats capturing: the id exists before the process does, so a
   * run that dies between the spawn and the parse can still be resumed.
   * Capture-only — OpenClaw's single mechanism — loses exactly that case,
   * because nobody ever learned what to resume.
   */
  const resumeSessionId =
    typeof payload.resumeSessionId === "string" ? payload.resumeSessionId : null;
  const assignedSessionId = spec.assignsSessionId
    ? (deps.newSessionId ?? randomUUID)()
    : null;

  /**
   * §8.3 — where the agent's hands go.
   *
   * With a repository, a worktree of this task's own, on a branch of this
   * task's own: two agents on two tasks cannot see each other's edits, and
   * what they produce is reviewable. Without one, the workspace directory
   * this daemon has always used — plenty of work touches no code, and
   * demanding a repository for it would be inventing a requirement.
   */
  const checkout = deps.checkoutFor ? await deps.checkoutFor(command) : null;
  if (checkout?.isFailure) {
    return failed(checkout.error);
  }
  const root =
    checkout?.value?.path ??
    (deps.ensureDirectory ?? ensureWorkspaceDirectory)(
      deps.workspaceRoot,
      command.workspaceId,
    );

  /**
   * §10, §18.12 — the protocol bridge, opened only when the hub gave this run
   * a credential to open it with. No grant means no bridge: an agent with the
   * tools but no identity would get an authentication error from every one of
   * them, and report a hub that is "down".
   *
   * Closed otherwise, and closed is the default — an agent inherits nothing
   * from the machine it happens to run on.
   */
  const grant = deps.grantFor ? await deps.grantFor(command) : null;
  const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
  const surface =
    grant && taskId
      ? (deps.openBridge ?? writeMcpBridge)({
          directory: root,
          hubUrl: grant.hubUrl,
          workspaceId: command.workspaceId,
          taskId,
          grantToken: grant.token,
          ...(grant.scopes ? { grantScopes: grant.scopes } : {}),
          serverCommand: grant.serverCommand,
          serverArgs: grant.serverArgs,
        })
      : CLOSED_SURFACE;
  const args =
    resumeSessionId && spec.resumeArgs
      ? spec.resumeArgs(prompt, resumeSessionId, surface)
      : spec.startArgs(prompt, assignedSessionId ?? "", surface);

  const plan = planExecution(
    {
      command: spec.command,
      args,
      // §7.9 — created before planning: containment is judged on the real
      // path, and a path that does not exist cannot be shown to be inside
      // anything. Every test pre-created it, so no test ever noticed.
      workspaceRoot: root,
      cwd: typeof payload.workdir === "string" ? payload.workdir : ".",
      env: {},
      secrets: deps.secretsFor(command),
      realpath: deps.realpath,
    },
    deps.settings,
  );
  if (plan.isFailure) {
    return failed(plan.error);
  }

  /**
   * §17 — what the agent was doing, while it was doing it.
   *
   * Read from the stream rather than reconstructed afterwards: the CLI prints
   * one JSON object per line as it goes, and the alternative is a run that
   * says a number when it ends and nothing at all before.
   */
  const reader = new TraceReader();

  let outcome: ExecutionOutcome;
  try {
    outcome = await (deps.supervise ?? superviseProcess)(
      plan.value,
      deps.limits,
      undefined,
      (chunk) => {
        for (const entry of reader.read(chunk)) {
          deps.onProgress?.(entry);
        }
      },
    );
  } catch (error) {
    return failed(`could not run the agent: ${String(error)}`);
  }

  if (outcome.stoppedBy !== null) {
    // §9.13's shape, one level down: a limit that fired is not the same as a
    // run that failed, and the report says which.
    return failed(
      `stopped by the ${outcome.stoppedBy} limit — the agent was still running`,
    );
  }

  const said = spec.parse(outcome.stdout);
  if (said.isFailure) {
    return failed(`${said.error} (exit ${outcome.exitCode}): ${outcome.stderr.slice(0, 400)}`);
  }

  /**
   * §8.7, §8.8 — what the agent left behind becomes a branch, or is reported
   * as having changed nothing.
   *
   * After the agent has finished, never during: committing mid-run would
   * record a tree the agent was still editing. And a failure to publish does
   * NOT fail the run — the work happened, the branch may simply not have
   * reached the remote, and losing the report of a run that succeeded is a
   * worse outcome than a branch somebody has to push by hand.
   */
  const published =
    checkout?.value && deps.publishFor
      ? await deps.publishFor(command, checkout.value)
      : null;

  return {
    outcome: "COMPLETED",
    result: {
      exitCode: outcome.exitCode,
      finalText: said.value.finalText,
      ...(checkout?.value
        ? {
            branch: checkout.value.branch,
            changed: published?.changed ?? false,
            // §8.8 — the hub's `openConflicts` was empty because nothing ever
            // reported into it. This is what reports into it.
            conflict: published?.conflict ?? null,
          }
        : {}),
      /**
       * The assigned id wins over the reported one: we told the CLI what to
       * call this session, and a CLI that echoed something else has not
       * changed where its state actually lives.
       */
      providerSessionId: assignedSessionId ?? said.value.sessionId,
      provider: providerName,
      // §17 — the short readable version of what happened, not the raw
      // stream. Token deltas are noise nobody reads and megabytes nobody
      // wants in a journal.
      trace: reader.trace,
      tokenUsage: said.value.tokenUsage,
      cost: said.value.cost,
      stderr: outcome.stderr,
    },
  };
}
