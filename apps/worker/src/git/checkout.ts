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
  /** Where this machine keeps its checkouts, when it has to make one. */
  root: string;
  workspaceId: string;
  taskId: string;
  /**
   * Where the repository already IS on this machine, when it is.
   *
   * This is the ordinary case and the one that matters: an operator's project
   * is already cloned, already has its dependencies installed, its `.env`, its
   * build cache. A fresh clone of a real project is a directory where nothing
   * runs — an agent in it spends its turn discovering that `node_modules` is
   * missing rather than doing the work.
   */
  workdir?: string;
  /** Where the repository comes from, when this machine has to fetch it. */
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
 * §8.3, §8.11 — puts a task's work in the repository this machine has.
 *
 * **One directory per repository, reused.** Not one worktree per task, which
 * is what the first version of this did. That version was better isolated and
 * worse in the way that decides whether any of this is usable: a fresh
 * checkout of a real project has no `node_modules`, no `.env`, no build
 * cache. An agent dropped into one spends its run discovering that nothing
 * runs. The operator's own working copy is the environment the work needs, so
 * that is where the work happens.
 *
 * The cost is stated rather than hidden: **two tasks cannot work in one
 * repository at the same time.** One directory holds one checked-out branch.
 * The caller serialises them (see `withRepository`); a run that cannot get in
 * is refused with a reason and can be dispatched again, which is the same
 * shape as every other resource this system contends for.
 *
 * **A branch per task, still.** That part did not change and should not: work
 * that lands on `main` directly is work nobody reviewed, and §8.11 refuses it
 * outright.
 *
 * **Branched off the ORIGIN's base branch** after fetching, never off whatever
 * happened to be checked out. A working copy left on a feature branch from
 * yesterday would otherwise start today's work from it.
 *
 * Always returns; never throws.
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
  // The operator's own copy when they named one; otherwise a directory of
  // this machine's own, per repository and not per task.
  const workdir = request.workdir ?? join(workspaceRoot, "repositories", request.taskId);

  try {
    if (fs.exists(join(workdir, ".git"))) {
      // It is already here. Catch up rather than start over — `--prune` so a
      // branch deleted upstream stops being offered.
      await git.run(["fetch", "--prune", "origin"], workdir);
    } else if (request.origin) {
      fs.makeDirectory(workspaceRoot);
      await git.run(["clone", request.origin, workdir], workspaceRoot);
    } else {
      /**
       * No origin and nothing there: a repository that starts here. Refused
       * rather than invented — `git init` on a path somebody expected to hold
       * their project would silently produce an empty one, and the agent
       * would report an empty project as the truth.
       */
      return {
        isFailure: true,
        error:
          `there is no repository at ${workdir} and no origin to fetch one ` +
          "from — register the repository with its address, or point it at a " +
          "clone this machine already has",
      };
    }

    /**
     * `-B` resets the branch to the base each time. A retry of the same task
     * therefore starts from the base rather than from what the previous
     * attempt left half-done — which is what makes a second attempt a second
     * attempt rather than a continuation of a failure.
     */
    await git.run(["checkout", "-B", request.branch, `origin/${request.baseBranch}`], workdir);
  } catch (error) {
    return { isFailure: true, error: `could not prepare the checkout: ${String(error)}` };
  }

  return { isFailure: false, value: { path: workdir, branch: request.branch } };
}
