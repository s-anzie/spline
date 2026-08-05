import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { planContainer } from "./container-plan";
import { PlanResult, planSpawn, SpawnRequest } from "./spawn-plan";

/** §18.5 — where a task runs, which decides what a task can reach. */
export type ExecutionBackend = "container" | "host";

export interface ExecutionSettings {
  backend: ExecutionBackend;
  containerRuntime: string;
  containerImage: string;
  containerMemory: string;
  containerCpus: string;
  containerPids: number;
  containerUser: string;
  allowedCommands: readonly string[];
}

export type TaskRequest = Omit<SpawnRequest, "allowedCommands">;

/**
 * The single door every task goes through, and the only place that knows
 * there is more than one backend.
 *
 * The order is the point. `planSpawn` runs FIRST and always: a container is a
 * boundary, not a reason to stop checking what goes into it. An order naming
 * an unlisted program, or an environment that would load code of its own, is
 * refused before any runtime is involved — defence in depth (§18.1) means
 * both, not either.
 *
 * Then, on the container path, the kernel is asked for what a process cannot
 * give itself: no network, no host filesystem, bounded memory and processes,
 * no capabilities.
 */
export function planExecution(
  task: TaskRequest,
  settings: ExecutionSettings,
): PlanResult {
  const host = planSpawn({ ...task, allowedCommands: settings.allowedCommands });
  if (host.isFailure || settings.backend === "host") {
    return host;
  }

  if (settings.containerImage.trim() === "") {
    return {
      isFailure: true,
      error:
        "the container backend needs an image: set CONTAINER_IMAGE, or set " +
        "EXECUTION_BACKEND=host to run without a boundary and know that you did",
    };
  }

  return {
    isFailure: false,
    value: planContainer(host.value, {
      runtime: settings.containerRuntime,
      image: settings.containerImage,
      // The root `planSpawn` resolved, not the one that was written: the mount
      // must name the same directory the containment check was made against.
      workspaceRoot: resolvedRoot(task),
      memory: settings.containerMemory,
      cpus: settings.containerCpus,
      pids: settings.containerPids,
      user: settings.containerUser,
    }),
  };
}

/**
 * The mount must name the same directory the containment check was made
 * against, so the root is resolved exactly as `planSpawn` resolved it —
 * `resolve` then `realpath`. Anything else and the boundary would be drawn
 * around a different directory than the one that was verified.
 *
 * `planSpawn` already proved this resolves: it refused otherwise, and we only
 * reach here on its success.
 */
function resolvedRoot(task: TaskRequest): string {
  const realpath = task.realpath ?? realpathSync;
  return realpath(resolve(task.workspaceRoot));
}
