import {
  prepareCheckout,
  type CheckoutFs,
  type CheckoutRequest,
  type GitRunner,
} from "./checkout";

/**
 * §8.3, §8.11 — where an agent's hands actually go.
 *
 * Until now an agent worked in one directory per WORKSPACE, shared by every
 * task, with no repository in it at all. Two agents on two tasks wrote over
 * each other, and nothing they produced was on a branch anybody could review.
 *
 * The hub already decided the rules: one worktree per task, a branch named
 * after the task, and branches that may never be worked on directly. This is
 * the machine carrying them out. Everything below is a refusal or an
 * isolation — the happy path is three git commands.
 */
describe("prepareCheckout", () => {
  const request: CheckoutRequest = {
    root: "/srv/spline",
    workspaceId: "w-1",
    taskId: "t-1",
    origin: "git@example.com:acme/app.git",
    branch: "spline/task/t-1",
    baseBranch: "main",
    protectedBranches: ["main", "release"],
  };

  /** Records what was run, and answers whatever the test wants it to. */
  function runner(answers: Record<string, string | Error> = {}): GitRunner & {
    calls: { args: readonly string[]; cwd: string }[];
  } {
    const calls: { args: readonly string[]; cwd: string }[] = [];
    return {
      calls,
      async run(args, cwd) {
        calls.push({ args, cwd });
        const key = args.join(" ");
        const answer = Object.entries(answers).find(([prefix]) => key.startsWith(prefix));
        if (answer && answer[1] instanceof Error) {
          throw answer[1];
        }
        return answer ? (answer[1] as string) : "";
      },
    };
  }

  /** Nothing here touches a real directory: only which commands were issued. */
  const fs = (present: string[] = []): CheckoutFs => ({
    exists: (path) => present.includes(path),
    makeDirectory: () => undefined,
  });

  it("gives each task its own worktree, so two agents cannot collide", async () => {
    const git = runner();

    const ready = await prepareCheckout(request, git, fs());

    expect(ready.isFailure).toBe(false);
    // The path names the task, not the workspace: that IS the isolation.
    expect(ready.value!.path).toContain("t-1");
    expect(ready.value!.path).not.toBe("/srv/spline/w-1");
  });

  it("clones once and fetches afterwards, rather than cloning every task", async () => {
    const git = runner();
    await prepareCheckout(request, git, fs());

    const commands = git.calls.map((call) => call.args.join(" "));
    expect(commands.some((line) => line.startsWith("clone"))).toBe(true);

    // Second task, same repository: the mirror is already there.
    const second = runner();
    await prepareCheckout(
      { ...request, taskId: "t-2", branch: "spline/task/t-2" },
      second,
      // The mirror is there from the first task.
      fs(["/srv/spline/w-1/.mirror/.git"]),
    );
    const again = second.calls.map((call) => call.args.join(" "));
    expect(again.some((line) => line.startsWith("clone"))).toBe(false);
    expect(again.some((line) => line.startsWith("fetch"))).toBe(true);
  });

  it("branches off the base branch, never off whatever was checked out", async () => {
    const git = runner();
    await prepareCheckout(request, git, fs());

    const worktree = git.calls
      .map((call) => call.args.join(" "))
      .find((line) => line.startsWith("worktree add"));
    expect(worktree).toContain("spline/task/t-1");
    // Off the ORIGIN's base branch: a mirror that had drifted would otherwise
    // start the work from a stale commit nobody chose.
    expect(worktree).toContain("origin/main");
  });

  /**
   * §8.11 — the rule the hub states and the machine has to enforce, because
   * the machine is where a branch name becomes a checkout.
   */
  it("refuses to work directly on a protected branch", async () => {
    const git = runner();

    const refused = await prepareCheckout({ ...request, branch: "main" }, git, fs());

    expect(refused.isFailure).toBe(true);
    expect(refused.error).toMatch(/protected/i);
    // And nothing was run: refused at the door, not half-way through.
    expect(git.calls).toEqual([]);
  });

  it("refuses a branch name that would escape the repository", async () => {
    const git = runner();

    for (const branch of ["../../etc/passwd", "-x", "a branch", ""]) {
      const refused = await prepareCheckout({ ...request, branch }, git, fs());
      expect(refused.isFailure).toBe(true);
    }
  });

  it("says what failed when git says no, rather than throwing into the daemon", async () => {
    const git = runner({ clone: new Error("Permission denied (publickey)") });

    const refused = await prepareCheckout(request, git, fs());

    expect(refused.isFailure).toBe(true);
    expect(refused.error).toContain("publickey");
  });

  it("reuses a worktree that already exists instead of failing on it", async () => {
    // A retry of the same task: the worktree is there from the first attempt.
    const git = runner({
      "worktree add": new Error("fatal: '/srv/spline/w-1/t-1' already exists"),
    });

    const ready = await prepareCheckout(request, git, fs());

    expect(ready.isFailure).toBe(false);
    const commands = git.calls.map((call) => call.args.join(" "));
    // It brings the existing one up to date rather than starting again.
    expect(commands.some((line) => line.startsWith("checkout"))).toBe(true);
  });
});
