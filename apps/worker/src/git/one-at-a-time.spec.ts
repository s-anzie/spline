import { forgetRepositories, withGitIndex } from "./one-at-a-time";

/**
 * Git's index, one caller at a time — and nothing wider.
 *
 * Two commits landing together fail on `.git/index.lock` with a message about
 * a lock file, which is true and useless. Everything above that level is
 * coordinated by locks and claims, which is what they are for.
 */
describe("withGitIndex", () => {
  beforeEach(() => forgetRepositories());

  it("runs one at a time in the same repository", async () => {
    const order: string[] = [];
    const slow = (name: string, ms: number) =>
      withGitIndex("/repo", async () => {
        order.push(`${name}:start`);
        await new Promise((done) => setTimeout(done, ms));
        order.push(`${name}:end`);
      });

    await Promise.all([slow("first", 20), slow("second", 1)]);

    // The second does not begin until the first has finished.
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("lets two different repositories run at the same time", async () => {
    const order: string[] = [];
    const work = (repo: string, name: string, ms: number) =>
      withGitIndex(repo, async () => {
        order.push(`${name}:start`);
        await new Promise((done) => setTimeout(done, ms));
        order.push(`${name}:end`);
      });

    await Promise.all([work("/a", "a", 20), work("/b", "b", 1)]);

    // Interleaved: nothing here coordinates between repositories.
    expect(order).toEqual(["a:start", "b:start", "b:end", "a:end"]);
  });

  /**
   * The failure mode that would be invisible: a task that throws leaving the
   * repository locked for the lifetime of the daemon.
   */
  it("releases the repository when the work fails", async () => {
    await expect(
      withGitIndex("/repo", async () => {
        throw new Error("the agent crashed");
      }),
    ).rejects.toThrow("the agent crashed");

    // The next one still gets in.
    await expect(withGitIndex("/repo", async () => "fine")).resolves.toBe("fine");
  });

  it("hands the caller its own result, not the previous holder's", async () => {
    const first = withGitIndex("/repo", async () => "first");
    const second = withGitIndex("/repo", async () => "second");

    expect(await first).toBe("first");
    expect(await second).toBe("second");
  });
});
