import { mergeBranch, type MergeRequest } from "./merge";
import type { GitRunner } from "./checkout";
import { forgetRepositories } from "./one-at-a-time";

/**
 * §8.7 — the act the hub could never perform.
 *
 * Merging needs a working copy and the hub owns no filesystem, so an approved
 * merge was marked merged in the same breath as being approved. This is the
 * somebody that does it.
 */
describe("mergeBranch", () => {
  beforeEach(() => forgetRepositories());

  const request: MergeRequest = {
    path: "/home/ada/app",
    sourceBranch: "spline/task/t-1",
    targetBranch: "main",
    approvedBy: "Ada Lovelace",
  };

  function runner(answers: Record<string, string | Error> = {}): GitRunner & {
    calls: string[][];
  } {
    const calls: string[][] = [];
    return {
      calls,
      async run(args) {
        calls.push([...args]);
        const key = args.join(" ");
        const answer = Object.entries(answers).find(([prefix]) => key.startsWith(prefix));
        if (answer && answer[1] instanceof Error) throw answer[1];
        return answer ? (answer[1] as string) : "";
      },
    };
  }

  it("merges onto the target and pushes it", async () => {
    const git = runner();

    const done = await mergeBranch(request, git);

    expect(done.isFailure).toBe(false);
    expect(done.value!.merged).toBe(true);
    const commands = git.calls.map((call) => call.join(" "));
    expect(commands.some((line) => line === "checkout main")).toBe(true);
    expect(commands.some((line) => line.startsWith("merge --no-ff"))).toBe(true);
    expect(commands.some((line) => line === "push origin main")).toBe(true);
  });

  /**
   * A fast-forward would make the merge invisible: the branch's commits would
   * appear on the target with nothing recording that a person approved them.
   */
  it("never fast-forwards, and says who approved it", async () => {
    const git = runner();
    await mergeBranch(request, git);

    const merge = git.calls.find((call) => call.includes("merge"));
    expect(merge).toContain("--no-ff");
    expect(merge?.join(" ")).toContain("Ada Lovelace");
  });

  it("catches up with the remote before merging, and refuses to force it", async () => {
    const git = runner();
    await mergeBranch(request, git);

    const commands = git.calls.map((call) => call.join(" "));
    expect(commands.some((line) => line.startsWith("fetch"))).toBe(true);
    // `--ff-only`: a target branch that has diverged is a question for a
    // person, not something to reconcile at three in the morning.
    expect(commands.some((line) => line.includes("pull --ff-only"))).toBe(true);
    expect(commands.every((line) => !line.includes("--force"))).toBe(true);
  });

  it("reports a conflict and puts the tree back, rather than resolving it", async () => {
    const git = runner({
      "merge --no-ff": new Error("CONFLICT (content): Merge conflict in src/app.ts"),
    });

    const done = await mergeBranch(request, git);

    expect(done.isFailure).toBe(false);
    expect(done.value!.merged).toBe(false);
    expect(done.value!.conflict).toContain("src/app.ts");
    expect(git.calls.some((call) => call.join(" ") === "merge --abort")).toBe(true);
    // Nothing was pushed: there is nothing to push.
    expect(git.calls.some((call) => call.includes("push"))).toBe(false);
  });

  it("says what failed when git refuses outright", async () => {
    const git = runner({ "checkout main": new Error("fatal: not a git repository") });

    const done = await mergeBranch(request, git);

    expect(done.isFailure).toBe(true);
    expect(done.error).toContain("not a git repository");
  });
});
