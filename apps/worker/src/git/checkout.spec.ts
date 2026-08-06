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

  /**
   * The case that decides whether any of this is usable: the operator's own
   * project, already cloned, already installed. A fresh clone of a real
   * project has no dependencies and no `.env` — an agent in one spends its
   * run discovering that nothing runs.
   */
  it("works in the copy the machine already has, and does not clone over it", async () => {
    const git = runner();

    const ready = await prepareCheckout(
      { ...request, workdir: "/home/ada/projects/app" },
      git,
      fs(["/home/ada/projects/app/.git"]),
    );

    expect(ready.isFailure).toBe(false);
    expect(ready.value!.path).toBe("/home/ada/projects/app");
    const commands = git.calls.map((call) => call.args.join(" "));
    expect(commands.some((line) => line.startsWith("clone"))).toBe(false);
    expect(commands.some((line) => line.startsWith("fetch"))).toBe(true);
  });

  it("clones when the machine has nothing yet", async () => {
    const git = runner();

    const ready = await prepareCheckout(request, git, fs());

    expect(ready.isFailure).toBe(false);
    expect(git.calls.map((call) => call.args.join(" "))[0]).toMatch(/^clone/);
  });

  /**
   * §8.3 — a project that starts here.
   *
   * A path an operator named, holding a project nobody has put under version
   * control yet. They are asking for a repository to exist there, and
   * whatever is already in the directory becomes its first commit: a project
   * somebody has been writing for a week does not lose its week to being
   * tracked.
   */
  it("starts a repository at a path somebody named", async () => {
    const git = runner();

    const ready = await prepareCheckout(
      { ...request, origin: "", workdir: "/home/ada/new-thing" },
      git,
      fs(),
    );

    expect(ready.isFailure).toBe(false);
    const commands = git.calls.map((call) => call.args.join(" "));
    expect(commands.some((line) => line === "init")).toBe(true);
    // What is already there is what it starts from.
    expect(commands.some((line) => line === "add -A")).toBe(true);
    expect(commands.some((line) => line.includes("commit --allow-empty"))).toBe(true);
    // And the base branch exists afterwards, or nothing could branch off it.
    expect(commands.some((line) => line === "branch -M main")).toBe(true);
    expect(commands.some((line) => line.startsWith("clone"))).toBe(false);
  });

  /**
   * No address, nothing on disk, and no path anybody named — nowhere to put
   * anything. A repository this machine chose the location of is one nobody
   * will find again.
   */
  it("refuses when there is nowhere to put it", async () => {
    const git = runner();

    const refused = await prepareCheckout({ ...request, origin: "" }, git, fs());

    expect(refused.isFailure).toBe(true);
    expect(refused.error).toMatch(/no address|no path/i);
  });

  it("works on the branch it was given, creating it off the base if it is new", async () => {
    // The branch does not exist yet: the plain checkout fails, and the
    // fallback creates it from the base.
    const git = runner({ "checkout spline": new Error("pathspec did not match") });
    await prepareCheckout(request, git, fs());

    const commands = git.calls.map((call) => call.args.join(" "));
    expect(commands.some((line) => line === "checkout spline/task/t-1")).toBe(true);
    expect(
      commands.some((line) => line === "checkout -b spline/task/t-1 origin/main"),
    ).toBe(true);
  });

  /**
   * Several agents share this copy. Resetting the branch would throw away
   * work a colleague had committed and not yet pushed — which is the one
   * failure nobody would attribute to the right cause.
   */
  it("never resets the branch, because somebody else may be on it", async () => {
    const git = runner();
    await prepareCheckout(request, git, fs(["/home/x/.git"]));

    const commands = git.calls.map((call) => call.args.join(" "));
    expect(commands.some((line) => line.includes("checkout -B"))).toBe(false);
  });

  /**
   * Level before a single edit. A run that skipped this would build on a past
   * nobody else has, and find out at push time — when the work is done.
   */
  it("takes what is behind and sends what is ahead before working", async () => {
    const git = runner();
    await prepareCheckout({ ...request, workdir: "/home/ada/app" }, git, fs(["/home/ada/app/.git"]));

    const commands = git.calls.map((call) => call.args.join(" "));
    expect(commands.some((line) => line.startsWith("fetch"))).toBe(true);
    expect(commands.some((line) => line.startsWith("pull --rebase"))).toBe(true);
    expect(commands.some((line) => line.startsWith("push"))).toBe(true);
  });

  /**
   * §8.3 — a project that lives on one machine and nowhere else.
   *
   * Real, not a defect: something nobody has pushed yet. Every agent working
   * on it is on that machine, sharing that checkout, and there is nothing to
   * be level with — so the machine must not try to talk to a remote that does
   * not exist.
   */
  describe("a project with no address", () => {
    const local = { ...request, origin: "", workdir: "/home/ada/app" };

    it("touches no remote at all", async () => {
      const git = runner();

      const ready = await prepareCheckout(local, git, fs(["/home/ada/app/.git"]));

      expect(ready.isFailure).toBe(false);
      const commands = git.calls.map((call) => call.args.join(" "));
      for (const remote of ["fetch", "pull", "push", "clone"]) {
        expect(commands.some((line) => line.startsWith(remote))).toBe(false);
      }
    });

    it("branches off the local base, since there is no origin/main", async () => {
      const git = runner({ "checkout spline": new Error("pathspec did not match") });
      await prepareCheckout(local, git, fs(["/home/ada/app/.git"]));

      const commands = git.calls.map((call) => call.args.join(" "));
      expect(commands.some((line) => line === "checkout -b spline/task/t-1 main")).toBe(
        true,
      );
      expect(commands.some((line) => line.includes("origin/main"))).toBe(false);
    });

    it("starts one at the named path when there is nothing there yet", async () => {
      const git = runner();

      const ready = await prepareCheckout(local, git, fs());

      expect(ready.isFailure).toBe(false);
      expect(git.calls.map((call) => call.args.join(" "))).toContain("init");
    });
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

});
