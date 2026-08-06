import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Owner-only, like every directory this daemon makes. */
const DIRECTORY_MODE = 0o700;

/**
 * Runs one git command and answers its output.
 *
 * Injected so a test can prove which commands are issued without a repository
 * on disk — and, more importantly, so nothing here is tempted to build a
 * shell string. Arguments stay an array all the way down: a branch name is
 * attacker-influenced (an agent asked for a task, a task named a branch), and
 * `git checkout $(rm -rf ~)` is what a string would allow.
 */
export interface GitRunner {
  run(args: readonly string[], cwd: string): Promise<string>;
}

/**
 * The filesystem, injected for the same reason the runner is: a test about
 * WHICH git commands are issued should not have to own a directory on the
 * machine running it. The same reason `agent-run` injects `ensureDirectory`.
 */
export interface CheckoutFs {
  exists(path: string): boolean;
  makeDirectory(path: string): void;
}

const realFs: CheckoutFs = {
  exists: (path) => existsSync(path),
  makeDirectory: (path) => {
    mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE });
  },
};

export interface CheckoutRequest {
  /** Where this machine keeps its checkouts. */
  root: string;
  workspaceId: string;
  taskId: string;
  /** Where the repository comes from. */
  origin: string;
  /** The branch this task works on — never one of the protected ones. */
  branch: string;
  /** What it branches off. */
  baseBranch: string;
  /** §8.11 — a workspace may protect more; it never protects fewer. */
  protectedBranches: readonly string[];
}

export interface Checkout {
  /** Where the agent runs. One per task. */
  path: string;
  branch: string;
}

export type CheckoutResult =
  | { isFailure: false; value: Checkout; error?: undefined }
  | { isFailure: true; error: string; value?: undefined };

/**
 * Git's own rules, minus everything that could be a path or a flag.
 *
 * Deliberately narrower than `git check-ref-format`: this accepts a subset
 * that is obviously safe rather than approximating a specification. A name
 * that starts with `-` would be read as a flag; one containing `..` walks; a
 * space splits nothing here but splits everything the moment somebody writes
 * a shell script around this.
 */
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function safeBranch(name: string): boolean {
  return (
    SAFE_BRANCH.test(name) &&
    !name.includes("..") &&
    !name.endsWith(".lock") &&
    !name.endsWith("/")
  );
}

/**
 * §8.3, §8.11 — puts a task's work where nothing else is working.
 *
 * Three decisions carry this:
 *
 * **One worktree per task.** Not per workspace, which is what the daemon did
 * before and which meant two agents on two tasks wrote over each other in the
 * same directory with no branch and no history. The hub already models a
 * worktree per task and refuses to open a second on the same one; this is the
 * machine keeping that promise.
 *
 * **One mirror per repository, cloned once.** Cloning per task would copy the
 * whole history for every piece of work — minutes, and gigabytes, for a
 * five-minute task. Worktrees share one object store by design, which is the
 * entire reason git has them.
 *
 * **Branched off the ORIGIN's base branch**, never off whatever the mirror
 * happens to have checked out. A mirror that has drifted would otherwise
 * start the work from a stale commit nobody chose, and the agent would spend
 * its run rediscovering that.
 *
 * Always returns; never throws. A daemon that dies half-way through a
 * checkout leaves a directory nobody can explain.
 */
export async function prepareCheckout(
  request: CheckoutRequest,
  git: GitRunner,
  fs: CheckoutFs = realFs,
): Promise<CheckoutResult> {
  /**
   * §8.11 — refused before anything runs, and that ordering matters: half a
   * checkout on a protected branch is still a checkout on a protected branch.
   */
  if (request.protectedBranches.includes(request.branch)) {
    return {
      isFailure: true,
      error:
        `"${request.branch}" is protected — work happens on a branch of its ` +
        "own and reaches it through a merge somebody approves (§8.11)",
    };
  }
  if (!safeBranch(request.branch)) {
    return {
      isFailure: true,
      error: `"${request.branch}" is not a branch name this machine will act on`,
    };
  }

  const workspaceRoot = join(request.root, request.workspaceId);
  const mirror = join(workspaceRoot, ".mirror");
  const worktree = join(workspaceRoot, "tasks", request.taskId);

  try {
    fs.makeDirectory(workspaceRoot);

    if (fs.exists(join(mirror, ".git"))) {
      // Already have it: catch up rather than start over. `--prune` so a
      // branch deleted upstream stops being offered here.
      await git.run(["fetch", "--prune", "origin"], mirror);
    } else {
      fs.makeDirectory(mirror);
      await git.run(["clone", request.origin, mirror], workspaceRoot);
    }

    try {
      await git.run(
        [
          "worktree",
          "add",
          "-B",
          request.branch,
          worktree,
          `origin/${request.baseBranch}`,
        ],
        mirror,
      );
    } catch (error) {
      /**
       * A retry of the same task finds its own worktree already there. That
       * is the ordinary case after a machine restart, not a failure — so it
       * is brought up to date instead of being refused. Any other error is
       * still an error.
       */
      if (!/already exists|already used/i.test(String(error))) {
        throw error;
      }
      await git.run(["checkout", request.branch], worktree);
    }
  } catch (error) {
    return { isFailure: true, error: `could not prepare the checkout: ${String(error)}` };
  }

  return { isFailure: false, value: { path: worktree, branch: request.branch } };
}
