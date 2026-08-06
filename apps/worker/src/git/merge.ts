import { GitRunner } from "./checkout";
import { withGitIndex } from "./one-at-a-time";

export interface MergeRequest {
  /** Where the repository is on this machine. */
  path: string;
  /** What is being merged. */
  sourceBranch: string;
  /** Where it is going — a protected branch, which is the point of asking. */
  targetBranch: string;
  /** Whose approval this carries, for the merge commit's message. */
  approvedBy: string;
}

export interface MergeOutcome {
  merged: boolean;
  /** Git's own words when it could not be done. */
  conflict: string | null;
}

export type MergeResult =
  | { isFailure: false; value: MergeOutcome; error?: undefined }
  | { isFailure: true; error: string; value?: undefined };

/**
 * §8.7 — performs a merge a person approved.
 *
 * The hub could never do this: merging needs a working copy, and the hub owns
 * no filesystem. So an approved merge used to be marked merged in the same
 * breath as being approved, with a comment saying that pretending otherwise
 * would leave requests stuck in APPROVED with nobody to move them. This is
 * the somebody.
 *
 * **`--no-ff`, always.** A fast-forward would make the merge invisible in the
 * history: the branch's commits would simply appear on the target with
 * nothing recording that a person approved them, on what date, for which
 * request. The merge commit is the record.
 *
 * **The approval is in the message**, for the same reason. Somebody reading
 * `git log` on the target branch a year from now should not have to open this
 * system to learn who let it in.
 *
 * **A conflict is reported and the tree is put back.** Not resolved: §8.7
 * says a merge is never performed by an agent, and a machine resolving
 * somebody's conflict is that, with more steps and less thought.
 *
 * Always returns; never throws.
 */
export async function mergeBranch(
  request: MergeRequest,
  git: GitRunner,
): Promise<MergeResult> {
  const cwd = request.path;

  try {
    await git.run(["fetch", "--prune", "origin"], cwd);

    /**
     * The whole merge holds the index. Unlike ordinary work — where agents
     * share the checkout and coordinate through locks — a merge moves the
     * checkout to another branch, and anything else committing meanwhile
     * would commit onto the wrong one.
     */
    return await withGitIndex(cwd, async (): Promise<MergeResult> => {
      await git.run(["checkout", request.targetBranch], cwd);
      await git.run(["pull", "--ff-only", "origin", request.targetBranch], cwd);

      try {
        await git.run(
          [
            "merge",
            "--no-ff",
            `origin/${request.sourceBranch}`,
            "-m",
            `Merge ${request.sourceBranch} into ${request.targetBranch}\n\n` +
              `Approved by ${request.approvedBy} in Spline.`,
          ],
          cwd,
        );
      } catch (error) {
        // Put the tree back where it was found. A half-merged checkout is one
        // the next task cannot use and nobody can read.
        await git.run(["merge", "--abort"], cwd).catch(() => undefined);
        return {
          isFailure: false,
          value: { merged: false, conflict: String(error) },
        };
      }

      await git.run(["push", "origin", request.targetBranch], cwd);
      return { isFailure: false, value: { merged: true, conflict: null } };
    });
  } catch (error) {
    return { isFailure: true, error: `could not merge: ${String(error)}` };
  }
}
