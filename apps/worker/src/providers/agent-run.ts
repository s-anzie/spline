import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { CommandReport } from "../execution/executor";
import { ClaimedCommand } from "../hub/hub-client";
import { ExecutionSettings, planExecution } from "../supervision/execution";
import { SpawnPlan } from "../supervision/spawn-plan";
import {
  ExecutionLimits,
  ExecutionOutcome,
  superviseProcess,
} from "../supervision/supervisor";
import { providerSpec } from "./provider-spec";

export interface AgentRunDeps {
  settings: ExecutionSettings;
  limits: ExecutionLimits;
  workspaceRoot: string;
  /** §18.4 — only what this task was granted. */
  secretsFor: (command: ClaimedCommand) => Record<string, string>;
  supervise?: (
    plan: SpawnPlan,
    limits: ExecutionLimits,
  ) => Promise<ExecutionOutcome>;
  realpath?: (path: string) => string;
  /** Injected so a test can say which id was assigned. */
  newSessionId?: () => string;
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

  const args =
    resumeSessionId && spec.resumeArgs
      ? spec.resumeArgs(prompt, resumeSessionId)
      : spec.startArgs(prompt, assignedSessionId ?? "");

  const plan = planExecution(
    {
      command: spec.command,
      args,
      workspaceRoot: join(deps.workspaceRoot, command.workspaceId),
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

  let outcome: ExecutionOutcome;
  try {
    outcome = await (deps.supervise ?? superviseProcess)(plan.value, deps.limits);
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

  return {
    outcome: "COMPLETED",
    result: {
      exitCode: outcome.exitCode,
      finalText: said.value.finalText,
      /**
       * The assigned id wins over the reported one: we told the CLI what to
       * call this session, and a CLI that echoed something else has not
       * changed where its state actually lives.
       */
      providerSessionId: assignedSessionId ?? said.value.sessionId,
      provider: providerName,
      tokenUsage: said.value.tokenUsage,
      cost: said.value.cost,
      stderr: outcome.stderr,
    },
  };
}
