import { workTools } from "./work-tools";

/**
 * The bug this file exists for: an agent that could report but not work.
 *
 * The surface offered the protocol tools and nothing else, so `--allowedTools`
 * listed only `mcp__spline__*`. With `--permission-mode dontAsk`, every tool
 * NOT on that list is refused rather than asked about — which meant a run
 * looked perfect from the outside (synchronize, claim, publish, release) and
 * wrote nothing. The first real end-to-end run said it out loud:
 *
 *   "Both Write and Bash tools are denied. I cannot create the file."
 */
describe("the tools an agent needs to do the work", () => {
  it("lets an agent that may claim also read, change and run", () => {
    const tools = workTools(["read_workspace_state", "acquire_locks"]);
    expect(tools).toEqual(
      expect.arrayContaining(["Read", "Glob", "Grep", "Write", "Edit", "Bash"]),
    );
  });

  /** §5 — you claim before you touch. No claim, no touching. */
  it("lets an agent that may not claim only look", () => {
    const tools = workTools(["read_workspace_state"]);
    expect(tools).toEqual(expect.arrayContaining(["Read", "Glob", "Grep"]));
    expect(tools).not.toContain("Write");
    expect(tools).not.toContain("Edit");
    expect(tools).not.toContain("Bash");
  });

  /**
   * §18.12 — an agent reading content it did not write cannot tell an
   * instruction from a payload. Fetching the open web is that, on purpose.
   */
  it("never opens the network to the agent's own judgement", () => {
    const tools = workTools(["read_workspace_state", "acquire_locks"]);
    expect(tools).not.toContain("WebFetch");
    expect(tools).not.toContain("WebSearch");
  });

  /**
   * An absent scope list is what an older hub answers. It means "everything"
   * for the protocol tools already, and must mean the same here — a worker
   * that silently downgraded an agent to read-only would look like the bug
   * above all over again.
   */
  it("assumes a full hand when the hub said nothing", () => {
    expect(workTools(undefined)).toContain("Bash");
  });
});
