import { allowedToolNames, PROTOCOL_TOOLS } from "./protocol-tools";

const context = { workspaceId: "w-1", taskId: "t-1" };

function tool(name: string) {
  const found = PROTOCOL_TOOLS.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`no tool named ${name}`);
  }
  return found;
}

describe("the protocol tools", () => {
  /**
   * This list IS the agent's capability surface. Stated as a test because
   * adding a line widens what every agent may do mid-task, and that should be
   * a decision somebody made rather than a diff nobody noticed.
   */
  it("exposes exactly the verbs of the §10 cycle", () => {
    expect(PROTOCOL_TOOLS.map((entry) => entry.name).sort()).toEqual([
      "acquire_lock",
      "publish_progress",
      "read_workspace",
      "record_decision",
      "release_lock",
      "report_blocker",
      "request_validation",
      "synchronize",
    ]);
  });

  it("says which step of the cycle each one serves", () => {
    for (const entry of PROTOCOL_TOOLS) {
      expect(entry.step).toMatch(/§10\./);
      // Read by a model: a description nobody can act on is a tool nobody uses.
      expect(entry.description.length).toBeGreaterThan(40);
    }
  });

  /**
   * §4.2, §18.10 — the workspace and the task come from the CONTEXT, never
   * from the agent's arguments. An agent that could name them could read
   * another workspace's tasks with a credential minted for this one.
   */
  describe("the agent never names its own workspace or task", () => {
    it.each(PROTOCOL_TOOLS.map((entry) => entry.name))(
      "%s takes neither as a parameter",
      (name) => {
        expect(Object.keys(tool(name).parameters)).not.toContain("workspaceId");
        expect(Object.keys(tool(name).parameters)).not.toContain("taskId");
      },
    );

    it("puts the context into the path, not into what the agent sent", () => {
      const call = tool("synchronize").request(context, {});

      expect(call.path).toBe("/workspaces/w-1/tasks/t-1");
    });

    it("ignores a workspace the agent tries to smuggle in", () => {
      const call = tool("read_workspace").request(context, { workspaceId: "w-2" });

      expect(call.path).toContain("w-1");
      expect(call.path).not.toContain("w-2");
    });
  });

  describe("what each verb asks the hub", () => {
    it("publishes progress as a fact about this task", () => {
      const call = tool("publish_progress").request(context, { summary: "halfway" });

      expect(call.method).toBe("POST");
      expect(call.path).toBe("/workspaces/w-1/events");
      expect(call.body).toMatchObject({ targetId: "t-1", payload: { summary: "halfway" } });
    });

    it("records a decision against this task", () => {
      const call = tool("record_decision").request(context, {
        title: "Use an index",
        rationale: "the scan is sequential",
      });

      expect(call.body).toMatchObject({ taskId: "t-1", title: "Use an index" });
    });

    it("reports a blocker on this task", () => {
      const call = tool("report_blocker").request(context, { description: "no access" });

      expect(call.path).toBe("/workspaces/w-1/tasks/t-1/blockers");
      expect(call.body).toMatchObject({ description: "no access" });
    });

    it("takes and gives back a lock", () => {
      const taken = tool("acquire_lock").request(context, {
        resourceType: "TASK",
        resourceId: "t-1",
        reason: "editing",
      });
      const given = tool("release_lock").request(context, { lockId: "lock-9" });

      expect(taken.body).toMatchObject({ resourceType: "TASK", reason: "editing" });
      expect(given.path).toBe("/workspaces/w-1/locks/lock-9/release");
    });

    /** §10.9 — the agent submits; something else decides it passed. */
    it("submits work for validation rather than declaring it done", () => {
      const call = tool("request_validation").request(context, {
        type: "unit_test",
        summary: "tests pass",
      });

      expect(call.path).toBe("/workspaces/w-1/validations");
      expect(call.body).toMatchObject({ taskId: "t-1", validationType: "unit_test" });
    });

    /**
     * No tool completes a task, and that absence is the point (§10.9, §11).
     * An agent with one would be able to declare its own success.
     */
    it("offers no way to declare the task complete", () => {
      for (const entry of PROTOCOL_TOOLS) {
        const call = entry.request(context, {});
        expect(call.path).not.toMatch(/\/complete$/);
        expect(JSON.stringify(call.body ?? {})).not.toContain("COMPLETED");
      }
    });
  });

  /**
   * Derived rather than written twice: a hand-kept allowlist could name a
   * tool that does not exist, or miss one that does — and the second is the
   * dangerous direction, since a tool nothing allows simply fails at runtime
   * in a way nobody understands.
   */
  it("derives the allowlist from the tools themselves", () => {
    const names = allowedToolNames("spline");

    expect(names).toHaveLength(PROTOCOL_TOOLS.length);
    expect(names).toContain("mcp__spline__synchronize");
    expect(names.every((name) => name.startsWith("mcp__spline__"))).toBe(true);
  });
});
