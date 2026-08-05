import { ContainerOptions, planContainer } from "./container-plan";
import { SpawnPlan } from "./spawn-plan";

const hostPlan: SpawnPlan = {
  command: "git",
  args: ["status", "--porcelain"],
  options: {
    cwd: "/srv/spline/w-1/task-42",
    env: { PATH: "/usr/bin", HOME: "/home/agent", SPLINE_TASK_ID: "t-42" },
    shell: false,
  },
};

function options(overrides: Partial<ContainerOptions> = {}): ContainerOptions {
  return {
    runtime: "docker",
    image: "spline/task:1",
    workspaceRoot: "/srv/spline/w-1",
    memory: "512m",
    cpus: "1",
    pids: 256,
    user: "1000:1000",
    ...overrides,
  };
}

/** The argument that follows a flag, so tests read as claims and not as indices. */
function valueOf(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe("planContainer", () => {
  it("runs the task's program inside the image, with its arguments", () => {
    const plan = planContainer(hostPlan, options());

    expect(plan.command).toBe("docker");
    expect(valueOf(plan.args, "--entrypoint")).toBe("git");
    // The image separates the runtime's flags from the task's arguments.
    expect(plan.args.slice(plan.args.indexOf("spline/task:1") + 1)).toEqual([
      "status",
      "--porcelain",
    ]);
  });

  it("works the same with podman, which is the point of naming the runtime", () => {
    expect(planContainer(hostPlan, options({ runtime: "podman" })).command).toBe(
      "podman",
    );
  });

  /**
   * The four things a process could not enforce about itself, and the whole
   * reason this backend exists. Each assertion is one of the gaps the worker's
   * README listed as open.
   */
  describe("the boundary a process cannot draw around itself", () => {
    it("cuts the network entirely", () => {
      expect(valueOf(planContainer(hostPlan, options()).args, "--network")).toBe(
        "none",
      );
    });

    it("mounts the workspace and nothing else of the host", () => {
      const args = planContainer(hostPlan, options()).args;

      expect(valueOf(args, "--volume")).toBe("/srv/spline/w-1:/workspace");
      // Exactly one mount: a second would be a second way out.
      expect(args.filter((arg) => arg === "--volume")).toHaveLength(1);
    });

    it("gives the task a read-only root, so only the workspace is writable", () => {
      const args = planContainer(hostPlan, options()).args;

      expect(args).toContain("--read-only");
      // A read-only root with no scratch space breaks ordinary programs, so
      // /tmp exists — in memory, capped, and unable to execute anything.
      expect(valueOf(args, "--tmpfs")).toMatch(/^\/tmp:.*noexec.*size=/);
    });

    it("bounds memory, swap, CPU and process count", () => {
      const args = planContainer(hostPlan, options()).args;

      expect(valueOf(args, "--memory")).toBe("512m");
      // Equal to memory on purpose: without it a task simply swaps past the
      // limit and the limit means nothing.
      expect(valueOf(args, "--memory-swap")).toBe("512m");
      expect(valueOf(args, "--cpus")).toBe("1");
      expect(valueOf(args, "--pids-limit")).toBe("256");
    });
  });

  describe("what runs inside is not privileged either", () => {
    it("drops every capability and forbids regaining any", () => {
      const args = planContainer(hostPlan, options()).args;

      expect(valueOf(args, "--cap-drop")).toBe("ALL");
      expect(valueOf(args, "--security-opt")).toBe("no-new-privileges");
    });

    it("runs as the given unprivileged user, never as root", () => {
      expect(valueOf(planContainer(hostPlan, options()).args, "--user")).toBe(
        "1000:1000",
      );
    });

    it("removes the container when it ends, leaving nothing to inherit", () => {
      expect(planContainer(hostPlan, options()).args).toContain("--rm");
    });
  });

  /**
   * The working directory arrives as a host path and must become a path
   * inside the mount. Anything else would either leak the host's layout or
   * point at nothing.
   */
  describe("the working directory is translated, not copied", () => {
    it("maps a directory under the root to the same place under the mount", () => {
      expect(valueOf(planContainer(hostPlan, options()).args, "--workdir")).toBe(
        "/workspace/task-42",
      );
    });

    it("maps the root itself to the mount point", () => {
      const plan = planContainer(
        { ...hostPlan, options: { ...hostPlan.options, cwd: "/srv/spline/w-1" } },
        options(),
      );

      expect(valueOf(plan.args, "--workdir")).toBe("/workspace");
    });
  });

  /**
   * §18.4 — a secret in argv is a secret in `ps`, readable by every account
   * on the machine. Passed by NAME, with the value travelling in the
   * runtime's own environment.
   */
  describe("secrets are passed by name, never by value", () => {
    const withSecret: SpawnPlan = {
      ...hostPlan,
      options: {
        ...hostPlan.options,
        env: { ...hostPlan.options.env, ANTHROPIC_API_KEY: "sk-do-not-print" },
      },
    };

    it("never puts a value on the command line", () => {
      const plan = planContainer(withSecret, options());

      expect(plan.args).not.toContain("sk-do-not-print");
      expect(plan.args.join(" ")).not.toContain("sk-do-not-print");
    });

    it("names it, so the runtime forwards it from its own environment", () => {
      const plan = planContainer(withSecret, options());

      expect(plan.args).toContain("ANTHROPIC_API_KEY");
      expect(plan.options.env.ANTHROPIC_API_KEY).toBe("sk-do-not-print");
    });

    /**
     * PATH and HOME describe the host and mean nothing inside the image,
     * which has its own. Forwarding them would be handing the task a map of
     * a machine it cannot see.
     */
    it("does not forward the host's own PATH and HOME into the container", () => {
      const args = planContainer(withSecret, options()).args;
      const forwarded = args.filter((arg, at) => args[at - 1] === "--env");

      expect(forwarded).toEqual(["SPLINE_TASK_ID", "ANTHROPIC_API_KEY"]);
    });

    it("still gives the runtime itself a PATH, or the runtime is not found", () => {
      expect(planContainer(withSecret, options()).options.env.PATH).toBe("/usr/bin");
    });
  });
});
