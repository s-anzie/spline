import { ExecutionSettings, planExecution } from "./execution";

function settings(overrides: Partial<ExecutionSettings> = {}): ExecutionSettings {
  return {
    backend: "container",
    containerRuntime: "docker",
    containerImage: "spline/task:1",
    containerMemory: "512m",
    containerCpus: "1",
    containerPids: 256,
    containerUser: "1000:1000",
    allowedCommands: ["git"],
    ...overrides,
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    command: "git",
    args: ["status"],
    workspaceRoot: "/srv/spline/w-1",
    cwd: "/srv/spline/w-1/task-42",
    env: {},
    secrets: {},
    hostEnv: { PATH: "/usr/bin", HOME: "/home/agent" },
    realpath: (path: string) => path,
    ...overrides,
  };
}

describe("planExecution", () => {
  describe("with a container", () => {
    it("hands the runtime the run, not the program", () => {
      const plan = planExecution(task(), settings());

      expect(plan.isFailure).toBe(false);
      expect(plan.value?.command).toBe("docker");
      expect(plan.value?.args).toContain("--network");
    });

    /**
     * The order matters, and this is the assertion that says so: the host
     * rules still run FIRST. A container is a boundary, not an excuse to stop
     * checking what goes into it — an order naming an unlisted program is
     * refused before any runtime is involved.
     */
    it("still applies the allowlist before the boundary", () => {
      const plan = planExecution(task({ command: "curl" }), settings());

      expect(plan.isFailure).toBe(true);
      expect(plan.error).toContain("curl");
    });

    it("still refuses an environment that would load code of its own", () => {
      const plan = planExecution(
        task({ env: { LD_PRELOAD: "/tmp/evil.so" } }),
        settings(),
      );

      expect(plan.isFailure).toBe(true);
    });

    it("still refuses a working directory outside the workspace", () => {
      const plan = planExecution(task({ cwd: "/etc" }), settings());

      expect(plan.isFailure).toBe(true);
      expect(plan.error).toContain("outside");
    });

    it("refuses when no image is configured, rather than picking one", () => {
      const plan = planExecution(task(), settings({ containerImage: "" }));

      expect(plan.isFailure).toBe(true);
      expect(plan.error).toContain("CONTAINER_IMAGE");
    });
  });

  describe("on the host", () => {
    /**
     * The escape hatch, and it is deliberately not the default. Everything
     * `planSpawn` enforces still applies — what is missing is the boundary,
     * which is why choosing this is an explicit act.
     */
    it("runs the program directly when an operator asked for it", () => {
      const plan = planExecution(task(), settings({ backend: "host" }));

      expect(plan.value?.command).toBe("git");
      expect(plan.value?.options.cwd).toBe("/srv/spline/w-1/task-42");
    });

    it("keeps every host-side rule", () => {
      expect(
        planExecution(task({ command: "curl" }), settings({ backend: "host" }))
          .isFailure,
      ).toBe(true);
    });
  });
});
