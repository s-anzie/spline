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
    allowedCommands: ["claude"],
    // Identity by default: the tests that care about symlinks say so.
    realpath: (path) => path,
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

  /**
   * The class OpenClaw shipped as CVE-2026-44115 and the Snyk sandbox
   * bypasses: the allowlist was there, and the environment walked around it.
   *
   * None of these need a shell. `LD_PRELOAD` loads an attacker's library into
   * every dynamically linked program; `NODE_OPTIONS=--require /tmp/x.js` turns
   * any node invocation into arbitrary code; `BASH_ENV` and `PYTHONSTARTUP`
   * do the same for their interpreters. A task-scoped variable that could set
   * them would make the allowlist decorative.
   */
  describe("the environment cannot load code of its own", () => {
    it.each([
      "LD_PRELOAD",
      "LD_AUDIT",
      "LD_LIBRARY_PATH",
      "DYLD_INSERT_LIBRARIES",
      "NODE_OPTIONS",
      "BASH_ENV",
      "ENV",
      "PYTHONSTARTUP",
      "PYTHONPATH",
      "PERL5OPT",
      "RUBYOPT",
      "GIT_SSH_COMMAND",
    ])("refuses %s in the task environment", (name) => {
      const plan = planSpawn(request({ env: { [name]: "/tmp/evil" } }));

      expect(plan.isFailure).toBe(true);
      expect(plan.error).toContain(name);
    });

    it("refuses it in the granted secrets too, which are just as attacker-shaped", () => {
      expect(
        planSpawn(request({ secrets: { LD_PRELOAD: "/tmp/evil.so" } })).isFailure,
      ).toBe(true);
    });

    /**
     * PATH decides which program a name resolves to, so letting a task set it
     * would mean the allowlist authorised "git" and something else ran.
     */
    it("refuses a task that tries to redefine where programs are found", () => {
      const plan = planSpawn(request({ env: { PATH: "/tmp/bin" } }));

      expect(plan.isFailure).toBe(true);
      expect(plan.error).toContain("PATH");
    });
  });

  /**
   * The TOCTOU/symlink class: CVE-2026-44112 and CVE-2026-44113, and the
   * weakest defence rate in the published analysis of OpenClaw (17%).
   *
   * `path.resolve` is string arithmetic — it never touches the filesystem, so
   * a directory inside the workspace that is a symlink to `/` resolved to a
   * path that looked perfectly contained.
   */
  describe("containment is judged on the real path, not the written one", () => {
    it("refuses a directory inside the workspace that points outside it", () => {
      const plan = planSpawn(
        request({
          cwd: "/srv/spline/w-1/escape",
          realpath: (p) => (p === "/srv/spline/w-1/escape" ? "/etc" : p),
        }),
      );

      expect(plan.isFailure).toBe(true);
      expect(plan.error).toContain("outside");
    });

    it("compares the real root too, so a symlinked root is not a false alarm", () => {
      const plan = planSpawn(
        request({
          workspaceRoot: "/srv/link",
          cwd: "/srv/link/task",
          realpath: (p) => p.replace("/srv/link", "/mnt/data/w-1"),
        }),
      );

      expect(plan.isFailure).toBe(false);
    });

    it("refuses when the path cannot be resolved at all", () => {
      const plan = planSpawn(
        request({
          realpath: () => {
            throw new Error("ENOENT");
          },
        }),
      );

      expect(plan.isFailure).toBe(true);
    });
  });

  /**
   * §18.1's least privilege, and the control that makes the rest mean
   * something: a worker executes only what its operator listed. Closed by
   * default — an empty list runs nothing, rather than everything.
   */
  describe("only listed programs run", () => {
    it("runs a program on the list", () => {
      expect(
        planSpawn(request({ allowedCommands: ["claude", "git"] })).isFailure,
      ).toBe(false);
    });

    it("refuses a program that is not on it", () => {
      const plan = planSpawn(request({ command: "curl", allowedCommands: ["claude"] }));

      expect(plan.isFailure).toBe(true);
      expect(plan.error).toContain("curl");
    });

    it("refuses everything when the list is empty, rather than allowing everything", () => {
      expect(planSpawn(request({ allowedCommands: [] })).isFailure).toBe(true);
    });

    /**
     * A name, never a path: `/tmp/evil/claude` and `../../bin/claude` both
     * end in "claude", and neither is the program the operator listed.
     */
    it.each(["/tmp/evil/claude", "../bin/claude", "./claude", "sub/claude"])(
      "refuses %j, which merely ends in an allowed name",
      (command) => {
        expect(
          planSpawn(request({ command, allowedCommands: ["claude"] })).isFailure,
        ).toBe(true);
      },
    );
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
