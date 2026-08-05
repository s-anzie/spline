import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface SpawnRequest {
  /** A program name, never a command line and never a path — see `planSpawn`. */
  command: string;
  args: string[];
  /** Everything this task may touch on disk (§7.9). */
  workspaceRoot: string;
  cwd: string;
  /** Task-scoped variables the hub sent. */
  env: Record<string, string>;
  /** Only what this task was granted (§18.4). */
  secrets: Record<string, string>;
  /**
   * The programs this machine's operator listed (§18.1). Closed by default:
   * an empty list runs nothing.
   */
  allowedCommands: readonly string[];
  /**
   * Where PATH and HOME come from. Injected rather than read from
   * `process.env` inside the function: a test proving nothing leaks should
   * not have to mutate this process to say so.
   */
  hostEnv?: Record<string, string | undefined>;
  /**
   * How a path is resolved to its real location. Injected for the same
   * reason: proving that a symlink out of the workspace is refused should not
   * require creating one on the machine running the tests.
   */
  realpath?: (path: string) => string;
}

export interface SpawnPlan {
  command: string;
  args: string[];
  options: {
    cwd: string;
    env: Record<string, string>;
    /** Always false. Never configurable. See below. */
    shell: false;
  };
}

export type PlanResult =
  | { isFailure: false; value: SpawnPlan; error?: undefined }
  | { isFailure: true; error: string; value?: undefined };

function fail(error: string): PlanResult {
  return { isFailure: true, error };
}

/**
 * Variables that make a process load code it was never asked to run.
 *
 * This is the hole an allowlist alone leaves open, and OpenClaw shipped it:
 * `LD_PRELOAD` injects a library into every dynamically linked program,
 * `NODE_OPTIONS=--require /tmp/x.js` turns any `node` invocation into
 * arbitrary code, `BASH_ENV` and `PYTHONSTARTUP` do the same for their
 * interpreters, `GIT_SSH_COMMAND` makes `git` run a program of your choosing.
 * None of them need a shell, and every one of them would let a task that was
 * authorised to run `git` run something else entirely.
 *
 * A denylist is the wrong shape for a boundary — the right shape is the
 * container this daemon does not build yet (see doc.md). It is here because
 * the alternative is nothing, and because each of these names is a documented
 * escape rather than a guess.
 */
const CODE_LOADING_VARIABLES = new Set([
  "BASH_ENV",
  "DYLD_FRAMEWORK_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "ENV",
  "GIT_SSH_COMMAND",
  "GIT_EXTERNAL_DIFF",
  "LD_AUDIT",
  "LD_LIBRARY_PATH",
  "LD_PRELOAD",
  "NODE_OPTIONS",
  "PERL5OPT",
  "PERL5LIB",
  "PYTHONPATH",
  "PYTHONSTARTUP",
  "RUBYOPT",
]);

/**
 * PATH decides which program a name resolves to. A task that could set it
 * would mean the allowlist authorised `git` and something else ran — so it is
 * the machine's, never the task's.
 */
const MACHINE_OWNED_VARIABLES = new Set(["PATH"]);

/**
 * The base environment. Deliberately built from nothing rather than spread
 * from `process.env`: §18.4 says the Runtime provides "uniquement les secrets
 * nécessaires à la tâche", and §6.10 forbids a runtime from ever receiving
 * another workspace's secrets. A spread would hand the agent every variable
 * this machine happens to hold — including the worker's own hub token.
 */
function baseEnvironment(
  host: Record<string, string | undefined>,
): Record<string, string> {
  return {
    PATH: host.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: host.HOME ?? "/tmp",
  };
}

function rejectedVariable(supplied: Record<string, string>): string | null {
  for (const name of Object.keys(supplied)) {
    const upper = name.toUpperCase();
    if (CODE_LOADING_VARIABLES.has(upper)) {
      return `${name} would let this task load code of its own choosing`;
    }
    if (MACHINE_OWNED_VARIABLES.has(upper)) {
      return `${name} belongs to the machine: a task that sets it decides which program an allowed name resolves to`;
    }
  }
  return null;
}

/**
 * Turns a request into something safe to hand to `spawn`.
 *
 * Five rules. Each one closes a class of escape that has been exploited in a
 * comparable agent runtime, and none of them is a substitute for the OS-level
 * boundary described in `doc.md` — they are what a process can enforce about
 * itself, which is less than a container enforces about a process.
 *
 * 1. **Never a shell.** Arguments contain text an agent wrote. With
 *    `shell: true`, every one of them is a chance to run something else; with
 *    a list and no shell there is nothing to interpret, and `; rm -rf /` is
 *    just an argument.
 * 2. **The command is a program name, not a line and not a path.** Accepting
 *    "sh -c ..." reintroduces rule 1 through the front door; accepting
 *    "/tmp/evil/claude" walks around rule 3 by ending in an allowed name.
 * 3. **Only listed programs run**, and an empty list runs nothing. Closed by
 *    default is the whole point: an operator who configures nothing is not
 *    quietly running everything.
 * 4. **The environment cannot load code.** See `CODE_LOADING_VARIABLES`.
 * 5. **The working directory stays inside the workspace** (§7.9), judged on
 *    the REAL path: `path.resolve` is string arithmetic and never touches the
 *    filesystem, so a directory inside the workspace that is a symlink to `/`
 *    used to resolve to something perfectly contained.
 */
export function planSpawn(request: SpawnRequest): PlanResult {
  const command = request.command.trim();
  if (command === "") {
    return fail("a command is required");
  }
  if (/\s/.test(command)) {
    return fail(
      `"${command}" looks like a command line; a command is a program name and its arguments go in args`,
    );
  }
  if (command.includes("/") || command.includes("\\")) {
    return fail(
      `"${command}" is a path; a command is a program name, resolved through the machine's PATH`,
    );
  }
  if (!request.allowedCommands.includes(command)) {
    return fail(
      `"${command}" is not among the programs this machine is allowed to run (§18.1)`,
    );
  }

  const badVariable =
    rejectedVariable(request.env) ?? rejectedVariable(request.secrets);
  if (badVariable !== null) {
    return fail(badVariable);
  }

  /**
   * Both sides resolved the same way, so a workspace root that is itself
   * behind a symlink is not mistaken for an escape. The remaining gap is
   * time: the directory can be swapped between this check and the spawn —
   * the TOCTOU race that CVE-2026-44112 and CVE-2026-44113 are. Closing it
   * for real needs the kernel to hold the descriptor, which is what running
   * the task inside a container does.
   */
  const realpath = request.realpath ?? realpathSync;
  let root: string;
  let cwd: string;
  try {
    root = realpath(resolve(request.workspaceRoot));
    const written = isAbsolute(request.cwd)
      ? resolve(request.cwd)
      : resolve(resolve(request.workspaceRoot), request.cwd);
    cwd = realpath(written);
  } catch (error) {
    return fail(
      `"${request.cwd}" could not be resolved, so it cannot be shown to be inside "${request.workspaceRoot}": ${String(error)}`,
    );
  }

  const inside = relative(root, cwd);
  // Empty means "the root itself"; anything starting with ".." walks out;
  // an absolute result means a different volume entirely.
  if (inside !== "" && (inside.startsWith(`..${sep}`) || inside === ".." || isAbsolute(inside))) {
    return fail(
      `"${request.cwd}" is outside the workspace root "${request.workspaceRoot}"`,
    );
  }

  return {
    isFailure: false,
    value: {
      command,
      args: [...request.args],
      options: {
        cwd,
        env: {
          ...baseEnvironment(request.hostEnv ?? process.env),
          ...request.env,
          ...request.secrets,
        },
        shell: false,
      },
    },
  };
}
