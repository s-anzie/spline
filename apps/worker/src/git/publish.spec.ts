import { publishWork, type GitRunner } from "./publish";

/**
 * §8.7, §8.8 — what becomes of what an agent wrote.
 *
 * The hub has always been able to say "this branch is ready to merge, and a
 * person approves it". What it never had is anything that produced a branch:
 * an agent edited files in a directory and nothing recorded, pushed or
 * reported them. `openConflicts` was empty in the merge conditions with a
 * comment saying it was empty because nothing reported into it.
 *
 * This is what reports into it.
 */
describe("publishWork", () => {
  const where = { path: "/srv/w-1/tasks/t-1", branch: "spline/task/t-1" };
  const who = { name: "Reviewer", email: "reviewer@agents.spline.local" };

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
        if (answer && answer[1] instanceof Error) {
          throw answer[1];
        }
        return answer ? (answer[1] as string) : "";
      },
    };
  }

  it("says plainly when an agent changed nothing", async () => {
    // `status --porcelain` prints nothing when the tree is clean.
    const git = runner({ "status --porcelain": "" });

    const published = await publishWork({ where, who, message: "Do the thing" }, git);

    expect(published.isFailure).toBe(false);
    expect(published.value!.changed).toBe(false);
    // Nothing was committed and nothing was pushed: an empty commit would put
    // a branch in front of a reviewer with nothing in it.
    expect(git.calls.some((call) => call.includes("commit"))).toBe(false);
    expect(git.calls.some((call) => call.includes("push"))).toBe(false);
  });

  it("commits as the agent, so the history says who did it", async () => {
    const git = runner({ "status --porcelain": " M src/app.ts\n?? src/new.ts\n" });

    const published = await publishWork({ where, who, message: "Rework intake" }, git);

    expect(published.isFailure).toBe(false);
    expect(published.value!.changed).toBe(true);

    const commit = git.calls.find((call) => call.includes("commit"));
    expect(commit?.join(" ")).toContain("Rework intake");
    // The AUTHOR is the agent; the machine is only where it ran. A history
    // that attributed everything to one daemon would make "who changed this"
    // unanswerable on the one system built to answer it.
    expect(commit?.join(" ")).toContain("Reviewer");
    expect(commit?.join(" ")).toContain("reviewer@agents.spline.local");
  });

  it("pushes the branch it was given and no other", async () => {
    const git = runner({ "status --porcelain": " M a\n" });

    await publishWork({ where, who, message: "m" }, git);

    const push = git.calls.find((call) => call.includes("push"));
    expect(push).toEqual(["push", "--set-upstream", "origin", "spline/task/t-1"]);
    // Never `--force`: rewriting a branch somebody may already be reading is
    // not something a daemon decides on its own.
    expect(push?.join(" ")).not.toContain("force");
  });

  /**
   * §8.8 — the case the hub has been unable to see. A conflict is discovered
   * by attempting to catch up with the base branch, which only the machine
   * holding a working copy can do.
   */
  it("reports a conflict rather than trying to be clever about it", async () => {
    const git = runner({
      "status --porcelain": " M a\n",
      rebase: new Error("CONFLICT (content): Merge conflict in src/app.ts"),
    });

    const published = await publishWork(
      { where, who, message: "m", catchUpWith: "origin/main" },
      git,
    );

    expect(published.isFailure).toBe(false);
    expect(published.value!.conflict).toBeTruthy();
    expect(published.value!.conflict).toContain("src/app.ts");
    // The work is still committed and pushed: a conflict is a question for a
    // person, not a reason to throw away what was done.
    expect(published.value!.changed).toBe(true);
    expect(git.calls.some((call) => call.includes("push"))).toBe(true);
    // And it leaves the tree as it found it rather than half-rebased.
    expect(git.calls.some((call) => call.join(" ").includes("rebase --abort"))).toBe(true);
  });

  it("catches up quietly when there is nothing in the way", async () => {
    const git = runner({ "status --porcelain": " M a\n" });

    const published = await publishWork(
      { where, who, message: "m", catchUpWith: "origin/main" },
      git,
    );

    expect(published.value!.conflict).toBeNull();
  });

  it("says what failed when a push is refused, rather than throwing", async () => {
    const git = runner({
      "status --porcelain": " M a\n",
      push: new Error("remote: Permission to acme/app.git denied"),
    });

    const published = await publishWork({ where, who, message: "m" }, git);

    expect(published.isFailure).toBe(true);
    expect(published.error).toContain("denied");
  });
});
