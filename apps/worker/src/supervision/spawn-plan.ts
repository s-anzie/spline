import { isAbsolute, relative, resolve, sep } from "node:path";

export interface SpawnRequest {
  /** A program name, never a command line — see `planSpawn`. */
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
   * Where PATH and HOME come from. Injected rather than read from
   * `process.env` inside the function: a test proving nothing leaks should
   * not have to mutate this process to say so.
   */
  hostEnv?: Record<string, string | undefined>;
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

/**
 * Turns a request into something safe to hand to `spawn`.
 *
 * Three rules, and each answers something an agent can influence:
 *
 * 1. **Never a shell.** Arguments contain text an agent wrote. With
 *    `shell: true`, every one of them is a chance to run something else; with
 *    a list and no shell there is nothing to interpret, and `; rm -rf /` is
 *    just an argument.
 * 2. **The command is a program name, not a line.** Accepting "sh -c ..."
 *    would reintroduce rule 1 through the front door.
 * 3. **The working directory stays inside the workspace** (§7.9). Compared
 *    after resolution, so `..` cannot walk out, and by path segment, so
 *    `/w-10` is not mistaken for a child of `/w-1`.
 */
export function planSpawn(request: SpawnRequest): PlanResult {
  const command = request.command.trim();
  if (command === "") {
    return { isFailure: true, error: "a command is required" };
  }
  if (/\s/.test(command)) {
    return {
      isFailure: true,
      error: `"${command}" looks like a command line; a command is a program name and its arguments go in args`,
    };
  }

  const root = resolve(request.workspaceRoot);
  const cwd = isAbsolute(request.cwd)
    ? resolve(request.cwd)
    : resolve(root, request.cwd);
  const inside = relative(root, cwd);
  // Empty means "the root itself"; anything starting with ".." walks out;
  // an absolute result means a different volume entirely.
  if (inside !== "" && (inside.startsWith(`..${sep}`) || inside === ".." || isAbsolute(inside))) {
    return {
      isFailure: true,
      error: `"${request.cwd}" is outside the workspace root "${request.workspaceRoot}"`,
    };
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
