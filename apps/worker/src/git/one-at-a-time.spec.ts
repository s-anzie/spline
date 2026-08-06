import { forgetRepositories, withRepository } from "./one-at-a-time";

/**
 * §8.4 — the guard that comes with working in the operator's own copy.
 *
 * One directory holds one checked-out branch. Two agents starting at once
 * would each reset it to their own branch, and the second would report the
 * first's edits as its own diff.
 */
describe("withRepository", () => {
  beforeEach(() => forgetRepositories());

  it("runs one at a time in the same repository", async () => {
    const order: string[] = [];
    const slow = (name: string, ms: number) =>
      withRepository("/repo", async () => {
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
      withRepository(repo, async () => {
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
      withRepository("/repo", async () => {
        throw new Error("the agent crashed");
      }),
    ).rejects.toThrow("the agent crashed");

    // The next one still gets in.
    await expect(withRepository("/repo", async () => "fine")).resolves.toBe("fine");
  });

  it("hands the caller its own result, not the previous holder's", async () => {
    const first = withRepository("/repo", async () => "first");
    const second = withRepository("/repo", async () => "second");

    expect(await first).toBe("first");
    expect(await second).toBe("second");
  });
});
