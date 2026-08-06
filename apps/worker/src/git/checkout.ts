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
 * §8.3, §8.11 — brings the working copy level with the remote, on the branch
 * the work happens on.
 *
 * **The operator's own copy**, at the path they gave. A fresh checkout of a
 * real project has no `node_modules`, no `.env`, no build cache; an agent
 * dropped into one spends its run discovering that nothing runs. Empty or
 * absent, it is cloned there — which is the same directory, just not yet
 * filled.
 *
 * **Level before anything starts.** Fetch, then send ahead what is ahead and
 * take what is behind. An agent that begins on a stale copy produces a diff
 * against a past nobody else shares, and discovers it at push time — which is
 * the worst moment, because the work is already done.
 *
 * **Agents are not serialised here.** An earlier version took the whole
 * repository for the duration of a run, which quietly replaced the system
 * that exists for this: locks and claims (§5, §11) coordinate at the level of
 * what is actually contended — the files, the resources — and let two agents
 * work in one project at once, which is the point of having them. What is
 * serialised is git's own index, and only for as long as a commit takes:
 * `.git/index.lock` is held by git itself, and two commits landing together
 * fail with a message about a lock file rather than about anything a person
 * can act on.
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
  // The operator's own copy when they named one; otherwise a place of this
  // machine's own, per repository.
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
     * On the working branch, without resetting it.
     *
     * `-B` was wrong here and the reason matters: several agents share this
     * copy, so resetting the branch would throw away work a colleague had
     * committed and not yet pushed. `checkout` alone when the branch exists,
     * created from the base only when it does not.
     */
    try {
      await git.run(["checkout", request.branch], workdir);
    } catch {
      await git.run(["checkout", "-b", request.branch, `origin/${request.baseBranch}`], workdir);
    }

    /**
     * Level with the remote before a single edit.
     *
     * Behind: take what is there. Ahead: send it. Both, or neither, are
     * ordinary — several machines and several agents share this branch. A run
     * that skipped this would build on a past nobody else has and find out at
     * push time, when the work is already done.
     *
     * `--rebase` rather than a merge: a merge commit per catch-up would bury
     * the history under bookkeeping nobody reads.
     */
    await git.run(["pull", "--rebase", "origin", request.branch], workdir).catch(async () => {
      // No upstream branch yet: nothing to take, and the push below creates
      // it. Not an error, and refusing here would stop a first task dead.
      await git.run(["rev-parse", "--abbrev-ref", "HEAD"], workdir);
    });
    await git
      .run(["push", "--set-upstream", "origin", request.branch], workdir)
      .catch(() => undefined);
  } catch (error) {
    return { isFailure: true, error: `could not prepare the checkout: ${String(error)}` };
  }

  return { isFailure: false, value: { path: workdir, branch: request.branch } };
}
