import { planSpawn, PlanResult, SpawnPlan, SpawnRequest } from "./spawn-plan";

/** Narrows a plan the test has already asserted is a success. */
function planned(result: PlanResult): SpawnPlan {
  if (result.isFailure) {
    throw new Error(`expected a plan, got: ${result.error}`);
  }
  return result.value;
}

function request(overrides: Partial<SpawnRequest> = {}): SpawnRequest {
  return {
    command: "claude",
    args: ["--print", "do the thing"],
    workspaceRoot: "/srv/spline/w-1",
    cwd: "/srv/spline/w-1/task-42",
    env: { SPLINE_TASK_ID: "t-42" },
    secrets: {},
    hostEnv: { PATH: "/usr/bin", HOME: "/home/agent", A_HOST_SECRET: "must not travel" },
    ...overrides,
  };
}

describe("planSpawn", () => {
  it("plans an ordinary run", () => {
    const plan = planned(planSpawn(request()));

    expect(plan.command).toBe("claude");
    expect(plan.args).toEqual(["--print", "do the thing"]);
  });

  /**
   * The single most important line in this file. A shell would turn every
   * argument into a chance to run something else, and an agent's own text
   * ends up in those arguments.
   */
  it("never asks for a shell", () => {
    const plan = planned(planSpawn(request()));

    expect(plan.options.shell).toBe(false);
  });

  it("passes arguments as a list, so nothing is ever parsed", () => {
    const plan = planned(
      planSpawn(request({ args: ["--print", "; rm -rf / #", "$(whoami)", "`id`"] })),
    );

    // Untouched, and harmless: with no shell there is nothing to interpret.
    expect(plan.args).toEqual(["--print", "; rm -rf / #", "$(whoami)", "`id`"]);
  });

  /**
   * §18.4 — "le Runtime fournit uniquement les secrets nécessaires à la
   * tâche". Spreading process.env would hand the agent every secret this
   * machine happens to hold, including other workspaces' (§6.10).
   */
  it("builds the environment from nothing, never from the host's", () => {
    const plan = planned(planSpawn(request()));

    expect(plan.options.env).not.toHaveProperty("A_HOST_SECRET");
    expect(plan.options.env.SPLINE_TASK_ID).toBe("t-42");
    // Only what a process genuinely cannot run without, plus what it was given.
    expect(Object.keys(plan.options.env).sort()).toEqual([
      "HOME",
      "PATH",
      "SPLINE_TASK_ID",
    ]);
  });

  it("adds the secrets the task was granted, and only those", () => {
    const plan = planned(
      planSpawn(request({ secrets: { ANTHROPIC_API_KEY: "sk-test" } })),
    );

    expect(plan.options.env.ANTHROPIC_API_KEY).toBe("sk-test");
  });

  /** §7.9 — file isolation. A worktree that escapes its workspace is not one. */
  describe("the working directory stays inside the workspace", () => {
    it.each([
      "/srv/spline/w-1/../w-2/task",
      "/srv/spline/w-2",
      "/etc",
      "..",
      "/srv/spline/w-1/../../etc",
    ])("refuses %j", (cwd) => {
      const plan = planSpawn(request({ cwd }));

      expect(plan.isFailure).toBe(true);
      expect(plan.error).toContain("outside");
    });

    it("accepts the workspace root itself and anything under it", () => {
      expect(planSpawn(request({ cwd: "/srv/spline/w-1" })).isFailure).toBe(false);
      expect(
        planSpawn(request({ cwd: "/srv/spline/w-1/deep/nested/place" })).isFailure,
      ).toBe(false);
    });

    it("refuses a lookalike sibling that merely shares a prefix", () => {
      // "/srv/spline/w-10" starts with "/srv/spline/w-1" as a string, and is
      // a different directory entirely.
      expect(planSpawn(request({ cwd: "/srv/spline/w-10/task" })).isFailure).toBe(true);
    });
  });

  it("refuses a run with no command at all", () => {
    expect(planSpawn(request({ command: "  " })).isFailure).toBe(true);
  });

  /** A command is a name, never a line: parsing one would be a shell again. */
  it("refuses a command that is really a command line", () => {
    expect(planSpawn(request({ command: "claude --print hello" })).isFailure).toBe(true);
    expect(planSpawn(request({ command: "sh -c 'rm -rf /'" })).isFailure).toBe(true);
  });
});
