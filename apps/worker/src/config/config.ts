import { hostname } from "node:os";

export interface WorkerConfig {
  hubUrl: string;
  token: string;
  hostname: string;
  heartbeatIntervalMs: number;
  /**
   * Declared, never detected: §9.9 makes a task assignable only to a
   * compatible worker, so claiming a capability this machine does not have
   * attracts work it cannot do.
   */
  capabilities: string[];
  labels: string[];
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
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
  const missing = ["HUB_URL", "WORKER_TOKEN"].filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing configuration: ${missing.join(", ")}. See .env.example.`,
    );
  }
  const interval = Number(env.HEARTBEAT_INTERVAL_MS ?? 30_000);
  if (!Number.isFinite(interval) || interval < 1000) {
    throw new Error("HEARTBEAT_INTERVAL_MS must be at least 1000");
  }
  return {
    hubUrl: requireSafeHubUrl(env.HUB_URL!.trim()),
    token: env.WORKER_TOKEN!.trim(),
    hostname: env.WORKER_HOSTNAME?.trim() || hostname(),
    heartbeatIntervalMs: interval,
    capabilities: list(env.WORKER_CAPABILITIES),
    labels: list(env.WORKER_LABELS),
  };
}
