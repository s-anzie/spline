/**
 * §18.5, §18.12 — the tools an agent uses to do the work, as opposed to the
 * tools it uses to say what it is doing.
 *
 * This file exists because the difference between the two was missed, and the
 * miss made the whole product a no-op. The surface offered the protocol tools
 * and only those, so `--allowedTools` listed `mcp__spline__*` and nothing
 * else. Combined with `--permission-mode dontAsk` — which turns an unlisted
 * tool into a refusal rather than a question — an agent could synchronize,
 * claim a file, publish progress and release the claim, all correctly, while
 * being physically unable to change a single byte. The run reported success.
 *
 * The first real end-to-end run said it in one line:
 *
 *   "Both Write and Bash tools are denied. I cannot create the file
 *    hello.txt without permission to write files or run shell commands."
 *
 * That is the failure this list closes.
 */

/** What anyone may do: look. Reading is how work starts. */
const LOOKING = ["Read", "Glob", "Grep"] as const;

/**
 * What changing the world takes.
 *
 * `Bash` is the uncomfortable one and it stays, because an agent that cannot
 * run the tests cannot know whether its work is good, and an agent that
 * cannot run `git` cannot push and free the claim it holds — which is the
 * behaviour §5 asks of it. Its boundary is not this list: it is the execution
 * backend (§18.5, layer 2). Naming it here without that boundary in place is
 * a deliberate, documented choice, not an oversight — the worker says so on
 * every boot when `EXECUTION_BACKEND=host`.
 */
const CHANGING = ["Write", "Edit", "NotebookEdit", "Bash"] as const;

/**
 * Left out on purpose: `WebFetch` and `WebSearch`.
 *
 * §18.12 — an agent cannot distinguish "instruction from my operator" from
 * "instruction hidden in what I read". Handing it the open web is handing
 * that channel to anyone who can get a page in front of it. Work that
 * genuinely needs the network gets it through a task's own commands, which
 * an operator chose, rather than through the agent's own judgement.
 */

/**
 * The tools this grant pays for.
 *
 * The discriminator is `acquire_locks`, and it is the right one rather than a
 * convenient one: §5 says you claim before you touch. An agent that may not
 * claim may not touch, and `READ_ONLY_AGENT` is exactly the role the matrix
 * refuses that permission to. So the same rule that governs the protocol
 * governs the filesystem, and there is no second place to keep in agreement.
 *
 * An absent list means "everything", matching `toolsFor` — that is what an
 * older hub answers, and silently downgrading such an agent to read-only
 * would reproduce the very bug this file is named after.
 */
export function workTools(scopes?: readonly string[]): string[] {
  if (!scopes) {
    return [...LOOKING, ...CHANGING];
  }
  return scopes.includes("acquire_locks")
    ? [...LOOKING, ...CHANGING]
    : [...LOOKING];
}
