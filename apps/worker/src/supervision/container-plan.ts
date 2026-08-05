import { relative } from "node:path";

import { SpawnPlan } from "./spawn-plan";

export interface ContainerOptions {
  /** `docker` or `podman`. Both take the flags used here. */
  runtime: string;
  /** The image a task runs in. It carries the tools, never the secrets. */
  image: string;
  /**
   * The host directory that becomes the container's `/workspace`. Already
   * resolved to its real path by `planSpawn`, which is what makes the mount
   * point at what it says.
   */
  workspaceRoot: string;
  memory: string;
  cpus: string;
  pids: number;
  /** `uid:gid`, never root. */
  user: string;
}

/** Where the workspace appears inside the container. */
export const MOUNT_POINT = "/workspace";

/**
 * Variables that describe the host and mean nothing inside the image, which
 * has its own. Forwarding them would hand the task a map of a machine it
 * cannot see.
 */
const HOST_SHAPED = new Set(["PATH", "HOME"]);

/**
 * Wraps a validated host plan into a run inside a container.
 *
 * `planSpawn` decides WHAT may run, WHERE and with WHICH variables — and
 * every one of those decisions is discipline, because a process cannot
 * confine itself. This is the part the kernel enforces, and it closes exactly
 * the four gaps the worker's README listed as open:
 *
 * | Gap | Closed by |
 * | --- | --- |
 * | The TOCTOU race | The mount namespace. A symlink inside the workspace resolves inside the CONTAINER — its `/etc` is the image's, and the host filesystem is not reachable at all. Swapping a directory between check and use now buys nothing, because there is nothing outside to reach. |
 * | The network | `--network none` |
 * | The rest of the disk | One bind mount, a read-only root, and a `noexec` tmpfs for scratch |
 * | Resources | `--memory`, `--memory-swap`, `--cpus`, `--pids-limit` |
 *
 * Plus what the host backend could only ask for politely: every capability
 * dropped, no way to regain one, an unprivileged user, and a container that
 * is removed when it ends so nothing survives the task.
 *
 * Secrets travel by NAME. A value in argv is a value in `ps`, readable by
 * every account on the machine — so it is put in the runtime's own
 * environment and forwarded by name (§18.4).
 */
export function planContainer(plan: SpawnPlan, options: ContainerOptions): SpawnPlan {
  const forwarded = Object.keys(plan.options.env).filter(
    (name) => !HOST_SHAPED.has(name),
  );

  const inside = relative(options.workspaceRoot, plan.options.cwd);
  const workdir = inside === "" ? MOUNT_POINT : `${MOUNT_POINT}/${inside}`;

  const args = [
    "run",
    "--rm",
    // The four the host backend could not draw.
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--memory",
    options.memory,
    "--memory-swap",
    options.memory,
    "--cpus",
    options.cpus,
    "--pids-limit",
    String(options.pids),
    // And what runs inside is not privileged either.
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    options.user,
    "--volume",
    `${options.workspaceRoot}:${MOUNT_POINT}`,
    "--workdir",
    workdir,
    ...forwarded.flatMap((name) => ["--env", name]),
    "--entrypoint",
    plan.command,
    options.image,
    ...plan.args,
  ];

  return {
    command: options.runtime,
    args,
    options: {
      // The runtime runs on the host, so it keeps the host's cwd and PATH —
      // without a PATH there is no `docker` to find.
      cwd: plan.options.cwd,
      env: plan.options.env,
      shell: false,
    },
  };
}
