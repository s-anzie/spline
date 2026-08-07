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
  /**
   * `judge_work` and `list_validations` spend `approve_validation`, which no
   * agent role holds in the matrix — so they are served to nobody unless a
   * workspace's owner has deliberately lent that power to its manager
   * (§18.3). Listing them here does not grant them; the grant does.
   */
  it("exposes exactly the verbs of the §10 cycle, plus the organising ones", () => {
    expect(PROTOCOL_TOOLS.map((entry) => entry.name).sort()).toEqual([
      "acquire_lock",
      "cut_task",
      "hand_over",
      "judge_work",
      "list_goals",
      "list_team",
      "list_validations",
      "publish_progress",
      "read_workspace",
      "record_decision",
      "release_lock",
      "report_blocker",
      "request_validation",
      "state_goal",
      "synchronize",
    ]);
  });

  /**
   * The half of the leash that lives here.
   *
   * A tool declares the permission it spends, and the bridge serves only the
   * ones the grant carries. Without a scope a tool would be handed to
   * everybody and refused by the hub at call time — which works, but tells an
   * agent it can do something and then punishes it for trying.
   */
  it("says what each tool spends", () => {
    for (const entry of PROTOCOL_TOOLS) {
      expect(entry.scope).toBeTruthy();
    }
  });

  it("puts the organising tools behind the organising permissions", () => {
    const scopeOf = (name: string) => tool(name).scope;

    expect(scopeOf("state_goal")).toBe("manage_goals");
    expect(scopeOf("cut_task")).toBe("manage_tasks");
    expect(scopeOf("hand_over")).toBe("manage_tasks");
    // Reading the team is not organising: a contributor may look.
    expect(scopeOf("list_team")).toBe("read_workspace_state");
  });

  it("says which step of the cycle each one serves", () => {
    for (const entry of PROTOCOL_TOOLS) {
      expect(entry.step).toMatch(/§\d/);
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
    /**
     * The workspace, never — for any tool. That one is absolute: a grant is
     * minted for one workspace, and a tool that let the agent name another
     * would be the §4.2 crossing with a credential attached.
     */
    it.each(PROTOCOL_TOOLS.map((entry) => entry.name))(
      "%s never names a workspace",
      (name) => {
        expect(Object.keys(tool(name).parameters)).not.toContain("workspaceId");
      },
    );

    /**
     * The task, never — for the cycle tools. An agent doing a task must not be
     * able to point them at somebody else's.
     *
     * The organising tools are the deliberate exception: `hand_over` moves a
     * task that is by definition not the manager's own, and `cut_task` names
     * the goal it serves. They stay inside the workspace the path carries, and
     * the hub checks `manage_tasks` on every one of them.
     */
    const CYCLE_TOOLS = PROTOCOL_TOOLS.filter((entry) => entry.step.includes("§10."));
    it.each(CYCLE_TOOLS.map((entry) => entry.name))(
      "%s acts on its own task and no other",
      (name) => {
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
      // The action is a body field; the hub serves one route for both
      // renewing and releasing. This asserted a `/release` path that never
      // existed — see "the paths the hub actually serves" below.
      expect(given.path).toBe("/workspaces/w-1/locks/lock-9");
      expect(given.body).toEqual({ action: "RELEASE" });
    });

    /** §10.9 — the agent submits; something else decides it passed. */
    it("submits work for validation rather than declaring it done", () => {
      const call = tool("request_validation").request(context, {
        type: "unit_test",
        summary: "tests pass",
      });

      expect(call.path).toBe("/workspaces/w-1/tasks/t-1/validations");
      expect(call.body).toMatchObject({
        validations: [{ type: "unit_test" }],
      });
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
  /**
   * The organising tools, called the way a model actually calls them.
   */
  describe("organising the work", () => {
    it("states a goal in this workspace, with what would prove it", () => {
      const call = tool("state_goal").request(context, {
        title: "Improve the document creation flow",
        description: "Take every piece of information it needs into account",
        successCriteria: ["no field is asked for twice", "a draft survives a reload"],
      });

      expect(call).toEqual({
        method: "POST",
        path: "/workspaces/w-1/goals",
        body: {
          title: "Improve the document creation flow",
          description: "Take every piece of information it needs into account",
          successCriteria: ["no field is asked for twice", "a draft survives a reload"],
        },
      });
    });

    /**
     * Models send lists three different ways, and the hub refuses an empty
     * array — so a manager whose criteria arrived as one string would be told
     * its own task is malformed with nothing to act on.
     */
    it.each([
      ["a real array", ["one", "two"]],
      ["a comma-separated line", "one, two"],
      ["one per line", "one\ntwo"],
      ["a bulleted list", "- one\n- two"],
      ["a numbered list", "1. one\n2. two"],
      ["semicolons", "one; two"],
    ])("takes criteria written as %s", (_label, written) => {
      const call = tool("state_goal").request(context, {
        title: "T",
        successCriteria: written,
      });

      expect(call.body?.successCriteria).toEqual(["one", "two"]);
    });

    it("keeps a decimal inside one criterion rather than splitting it", () => {
      const call = tool("state_goal").request(context, {
        title: "T",
        successCriteria: "the page loads in 1,5 s; nothing else changes",
      });

      expect(call.body?.successCriteria).toEqual([
        "the page loads in 1,5 s",
        "nothing else changes",
      ]);
    });

    it("hangs a goal under another when a need turns out to be several", () => {
      const call = tool("state_goal").request(context, {
        title: "Rewrite the intake form",
        successCriteria: ["one screen, no repeated fields"],
        parentGoalId: "g-parent",
      });

      expect(call.body?.parentGoalId).toBe("g-parent");
    });

    it("leaves a standalone goal without a parent rather than inventing one", () => {
      const call = tool("state_goal").request(context, {
        title: "Rewrite the intake form",
        successCriteria: ["one screen"],
      });

      expect(call.body).not.toHaveProperty("parentGoalId");
    });

    it("cuts a task out of a goal and gives it to somebody by name", () => {
      const call = tool("cut_task").request(context, {
        goalId: "g-9",
        title: "Audit the current form",
        description: "List every field and where it comes from",
        acceptanceCriteria: ["every field is listed with its source"],
        assigneeId: "agent-7",
      });

      expect(call.method).toBe("POST");
      expect(call.path).toBe("/workspaces/w-1/tasks");
      expect(call.body).toEqual({
        goalId: "g-9",
        title: "Audit the current form",
        description: "List every field and where it comes from",
        acceptanceCriteria: ["every field is listed with its source"],
        // §4.6 — assigned from its first instant, so the tool cannot omit it.
        assigneeType: "AGENT",
        assigneeId: "agent-7",
        // And READY from its first instant too: nothing dispatches a PLANNED
        // task, so a manager's entire plan used to sit still after being cut.
        start: true,
      });
    });

    /**
     * §8.3 — the link that would otherwise break at the manager.
     *
     * A person names a project on the need; the manager cuts five tasks; and
     * if it cannot pass the project down, none of the five touches any code.
     */
    it("passes the project down to the tasks it cuts", () => {
      const call = tool("cut_task").request(context, {
        goalId: "g-9",
        title: "Audit the form",
        acceptanceCriteria: ["listed"],
        assigneeId: "agent-7",
        repositoryId: "r-1",
      });

      expect(call.body?.repositoryId).toBe("r-1");
    });

    it("leaves it out for work that touches no code", () => {
      const call = tool("cut_task").request(context, {
        goalId: "g-9",
        title: "Ask the client what they meant",
        acceptanceCriteria: ["answered"],
        assigneeId: "agent-7",
      });

      expect(call.body).not.toHaveProperty("repositoryId");
    });

    it("hands an existing task to somebody else", () => {
      const call = tool("hand_over").request(context, {
        taskId: "t-42",
        assigneeId: "agent-3",
      });

      expect(call.method).toBe("POST");
      expect(call.path).toBe("/workspaces/w-1/tasks/t-42/assign");
      expect(call.body).toEqual({ assigneeType: "AGENT", assigneeId: "agent-3" });
    });

    it("reads the team and the goals of its own workspace only", () => {
      expect(tool("list_team").request(context, {}).path).toBe("/workspaces/w-1/members");
      expect(tool("list_goals").request(context, {}).path).toBe("/workspaces/w-1/goals");
    });

    /**
     * §18 — organising is not staffing. Issuing an identity is an
     * organization-level act reserved to a person, so no tool here can reach
     * it: an agent that could mint agents could multiply out of sight, and
     * the bill would be the operator's.
     */
    it("offers no way to create an identity, or to touch the organization", () => {
      for (const entry of PROTOCOL_TOOLS) {
        expect(entry.request(context, {}).path).toMatch(/^\/workspaces\/w-1(\/|$)/);
      }
    });
  });

  it("derives the allowlist from the tools themselves", () => {
    const names = allowedToolNames("spline");

    expect(names).toHaveLength(PROTOCOL_TOOLS.length);
    expect(names).toContain("mcp__spline__synchronize");
    expect(names.every((name) => name.startsWith("mcp__spline__"))).toBe(true);
  });
});

/**
 * §10.10, §10.9 — the two tools that called routes the hub does not serve.
 *
 * Both were wrong from the day they were written and nothing noticed, because
 * a 404 comes back as an ordinary tool answer: the agent reads it, reasons
 * politely about it ("the endpoint returned 404 — it may have already
 * expired"), and carries on. The work looked done. The lock was never given
 * back and the validation was never asked for.
 *
 * Found on the first real run, at the two last steps of the protocol — the
 * ones that only matter after everything else went right, which is why no
 * amount of unit testing the happy path was ever going to reach them.
 *
 * These assertions pin the SHAPE against the hub's controllers. They are
 * deliberately literal: a path spelled out here disagrees loudly with a route
 * that moves, which is the whole point.
 */
describe("the paths the hub actually serves", () => {
  const context = { workspaceId: "w1", taskId: "t1", hubUrl: "http://hub" };
  const find = (name: string) => {
    const tool = PROTOCOL_TOOLS.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`no tool named ${name}`);
    return tool;
  };

  /** `POST /locks/:id`, with the action in the body — there is no `/release`. */
  it("gives a lock back the way the lock controller takes it", () => {
    const request = find("release_lock").request(context, { lockId: "l1" });

    expect(request.method).toBe("POST");
    expect(request.path).toBe("/workspaces/w1/locks/l1");
    expect(request.body).toEqual({ action: "RELEASE" });
  });

  /**
   * The task is in the PATH, validations arrive as a LIST, and the body
   * carries nothing the controller does not declare. `forbidNonWhitelisted`
   * is on, so a single extra field refuses the whole call — which is how a
   * `summary` nobody asked for made every submission fail with
   * "validations.0.property output should not exist".
   */
  it("asks for validation the way the validation controller takes it", () => {
    const request = find("request_validation").request(context, {
      type: "unit_test",
    });

    expect(request.method).toBe("POST");
    expect(request.path).toBe("/workspaces/w1/tasks/t1/validations");
    expect(request.body).toEqual({ validations: [{ type: "unit_test" }] });
  });

  it("carries mandatory only when it was actually asked for", () => {
    const asked = find("request_validation").request(context, {
      type: "human_review",
      mandatory: true,
    });

    expect(asked.body).toEqual({
      validations: [{ type: "human_review", mandatory: true }],
    });
  });
});
