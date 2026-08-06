import { Checkout, GitRunner } from "./checkout";
import { withGitIndex } from "./one-at-a-time";

export type { GitRunner };

export interface PublishRequest {
  where: Checkout;
  /**
   * Whose name goes on the commit.
   *
   * The AGENT, not this daemon. A history that attributed every change to one
   * machine account would make "who changed this, and why" unanswerable on the
   * one system built to answer it — and §14's whole premise is that an act has
   * an actor.
   */
  who: { name: string; email: string };
  message: string;
  /**
   * §8.8 — the branch to catch up with before publishing, when there is one.
   *
   * Left out when the caller does not want a rebase attempted: catching up is
   * how a conflict is DISCOVERED, and discovering one is only useful if
   * somebody is going to be told.
   */
  catchUpWith?: string;
  /** False for a project with no address: there is nowhere to push. */
  hasRemote?: boolean;
}

export interface PublishedWork {
  /** False when the agent edited nothing. Not a failure — often the answer. */
  changed: boolean;
  /** Git's own words, when catching up could not be done cleanly. */
  conflict: string | null;
}

export type PublishResult =
  | { isFailure: false; value: PublishedWork; error?: undefined }
  | { isFailure: true; error: string; value?: undefined };

/**
 * §8.7, §8.8 — records what an agent did, and says whether anybody has to
 * look at it.
 *
 * Four decisions, and each of them is about not being clever:
 *
 * **Nothing changed is an answer, not an error.** An agent that read the code
 * and concluded there was nothing to do has done its job. Committing an empty
 * change would put a branch in front of a reviewer with nothing in it, and
 * `--allow-empty` is how a review queue fills with noise.
 *
 * **The commit is authored by the agent.** The machine is only where it ran.
 *
 * **Never `--force`.** Rewriting a branch somebody may already be reading is
 * not a decision a daemon takes at three in the morning.
 *
 * **A conflict is reported, never resolved.** The work is still committed and
 * still pushed — a conflict is a question for a person, not a reason to throw
 * away what was done — and the rebase is aborted so the tree is left as it was
 * found rather than half-applied. §8.7 already says a merge is never performed
 * by an agent; resolving a conflict is that same act with more steps.
 *
 * Always returns; never throws.
 */
export async function publishWork(
  request: PublishRequest,
  git: GitRunner,
): Promise<PublishResult> {
  const cwd = request.where.path;

  try {
    const dirty = (await git.run(["status", "--porcelain"], cwd)).trim();
    if (dirty === "") {
      return { isFailure: false, value: { changed: false, conflict: null } };
    }

    /**
     * The index, and only the index. Two agents committing together fail on
     * `.git/index.lock` with a message about a lock file — true, and useless
     * to whoever reads it. Held for the length of a commit, not of a run.
     */
    await withGitIndex(cwd, async () => {
      // `-A` so a file the agent deleted is recorded as deleted. Anything
      // less makes a commit that does not describe the tree it came from.
      await git.run(["add", "-A"], cwd);
      await git.run(
          [
          // Identity per invocation rather than configured on the repository:
          // the next task on this machine is a different agent, and a config
          // written once would sign its commits with the wrong name.
          "-c",
          `user.name=${request.who.name}`,
          "-c",
          `user.email=${request.who.email}`,
          "commit",
          "-m",
          request.message,
        ],
        cwd,
      );
    });

    let conflict: string | null = null;
    if (request.catchUpWith) {
      try {
        await git.run(["rebase", request.catchUpWith], cwd);
      } catch (error) {
        conflict = String(error);
        // Left as it was found. A half-rebased worktree is a worktree the next
        // attempt cannot use and nobody can read.
        try {
          await git.run(["rebase", "--abort"], cwd);
        } catch {
          // Already aborted, or the rebase never started. Either way there is
          // nothing further to undo, and failing here would replace a useful
          // report with a useless one.
        }
      }
    }

    /**
     * Pushed when there is somewhere to push to. A project that exists only
     * on one machine keeps its work in its own history — which is the whole
     * bargain of registering one without an address, and stating it here
     * beats failing on `origin` not existing.
     */
    if (request.hasRemote !== false) {
      await git.run(["push", "--set-upstream", "origin", request.where.branch], cwd);
    }
    return { isFailure: false, value: { changed: true, conflict } };
  } catch (error) {
    return { isFailure: true, error: `could not publish the work: ${String(error)}` };
  }
}
