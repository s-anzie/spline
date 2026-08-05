import { hostname } from "node:os";
import { resolve } from "node:path";

import { ExecutionBackend } from "../supervision/execution";

export interface WorkerConfig {
  hubUrl: string;
  /**
   * §6.3 — null on a machine that has never paired, which is the normal first
   * run. It used to be required, which meant an operator had to obtain a
   * credential before the daemon would even start — and the only way to
   * obtain one was to write code.
   */
  token: string | null;
  /** Where this machine keeps who it is, once paired. */
  statePath: string;
  /**
   * §10 — the MCP bridge an agent's tools talk to. A path rather than a
   * package name: the agent's CLI spawns it, and a name it would have to
   * resolve is a name it could resolve to something else.
   */
  mcpServerPath: string;
  /**
   * §7.9, §6.10 — the root under which each workspace gets its own
   * directory. A workspace never names its own root: one that could would be
   * naming another's.
   */
  workspaceRoot: string;
  hostname: string;
  heartbeatIntervalMs: number;
  /**
   * Declared, never detected: §9.9 makes a task assignable only to a
   * compatible worker, so claiming a capability this machine does not have
   * attracts work it cannot do.
   */
  capabilities: string[];
  labels: string[];
  /**
   * §18.1 — the programs this machine will run, and nothing else. Closed by
   * default: an operator who lists nothing runs nothing, rather than quietly
   * running everything an order happens to name.
   */
  allowedCommands: string[];
  /** How long a task may run, and how much of its output is kept. */
  taskTimeoutMs: number;
  maxOutputBytes: number;
  /**
   * §18.5 — where a task runs, which decides what a task can reach.
   * `container` by default: a process cannot confine itself, and the four
   * things it cannot do about that (the TOCTOU race, the network, the rest of
   * the disk, resources) are exactly what a kernel boundary closes.
   */
  backend: ExecutionBackend;
  containerRuntime: string;
  containerImage: string;
  containerMemory: string;
  containerCpus: string;
  containerPids: number;
  containerUser: string;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function bounded(
  raw: string | undefined,
  fallback: number,
  name: string,
  floor: number,
): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < floor) {
    throw new Error(`${name} must be a number of at least ${floor}`);
  }
  return parsed;
}

/**
 * Under the user's own config directory, like every other tool that keeps a
 * credential per machine. Never beside the source: a state file in a checkout
 * is a state file in a backup, a container image, and eventually a commit.
 */
function defaultStatePath(env: NodeJS.ProcessEnv): string {
  const base =
    env.XDG_CONFIG_HOME?.trim() ||
    (env.HOME ? `${env.HOME}/.config` : "/tmp/.config");
  return `${base}/spline-worker/identity.json`;
}

function defaultWorkspaceRoot(env: NodeJS.ProcessEnv): string {
  const base =
    env.XDG_DATA_HOME?.trim() ||
    (env.HOME ? `${env.HOME}/.local/share` : "/tmp/.local/share");
  return `${base}/spline-worker/workspaces`;
}

function defaultContainerUser(): string {
  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;
  return `${uid}:${gid}`;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * §18 — the worker attaches its bearer token to every request it makes. Over
 * plain http that token crosses the network readable by anything on the
 * path, and the holder of it can register workers, claim commands and report
 * results as this machine.
 *
 * Loopback is the exception, and only loopback: a hub on the same host during
 * development never leaves the machine. Anything else must be https, refused
 * at startup rather than discovered in a packet capture.
 */
function requireSafeHubUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`HUB_URL is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`HUB_URL must be http or https, got ${parsed.protocol}`);
  }
  if (parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `HUB_URL must use https to reach ${parsed.hostname}: the worker token ` +
        "would otherwise be sent in clear text. Plain http is allowed for " +
        "localhost only.",
    );
  }
  return raw.replace(/\/$/, "");
}

/**
 * Read once, at startup, and refused loudly if incomplete. A worker that
 * starts without a hub to talk to would look healthy while doing nothing —
 * exactly the silence §9.16 warns about, one level down.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  if (!env.HUB_URL?.trim()) {
    throw new Error("Missing configuration: HUB_URL. See .env.example.");
  }
  const interval = Number(env.HEARTBEAT_INTERVAL_MS ?? 30_000);
  if (!Number.isFinite(interval) || interval < 1000) {
    throw new Error("HEARTBEAT_INTERVAL_MS must be at least 1000");
  }
  const backend = env.EXECUTION_BACKEND?.trim() || "container";
  if (backend !== "container" && backend !== "host") {
    throw new Error(`EXECUTION_BACKEND must be "container" or "host", got "${backend}"`);
  }

  return {
    backend,
    containerRuntime: env.CONTAINER_RUNTIME?.trim() || "docker",
    containerImage: env.CONTAINER_IMAGE?.trim() ?? "",
    containerMemory: env.CONTAINER_MEMORY?.trim() || "1g",
    containerCpus: env.CONTAINER_CPUS?.trim() || "2",
    containerPids: bounded(env.CONTAINER_PIDS, 512, "CONTAINER_PIDS", 16),
    // The worker's own identity by default, so files a task creates in the
    // workspace belong to whoever will read them afterwards. Never root: the
    // preflight refuses to start there in the first place.
    containerUser: env.CONTAINER_USER?.trim() || defaultContainerUser(),
    allowedCommands: list(env.WORKER_ALLOWED_COMMANDS),
    taskTimeoutMs: bounded(env.TASK_TIMEOUT_MS, 15 * 60_000, "TASK_TIMEOUT_MS", 1000),
    maxOutputBytes: bounded(
      env.MAX_OUTPUT_BYTES,
      1_000_000,
      "MAX_OUTPUT_BYTES",
      1024,
    ),
    hubUrl: requireSafeHubUrl(env.HUB_URL!.trim()),
    // A token in the environment still wins: it is how a machine provisioned
    // by configuration management skips pairing entirely.
    token: env.WORKER_TOKEN?.trim() || null,
    statePath: env.WORKER_STATE_PATH?.trim() || defaultStatePath(env),
    mcpServerPath:
      env.MCP_SERVER_PATH?.trim() || resolve(__dirname, "..", "mcp", "server.js"),
    workspaceRoot: env.WORKSPACE_ROOT?.trim() || defaultWorkspaceRoot(env),
    hostname: env.WORKER_HOSTNAME?.trim() || hostname(),
    heartbeatIntervalMs: interval,
    capabilities: list(env.WORKER_CAPABILITIES),
    labels: list(env.WORKER_LABELS),
  };
}
