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
    hubUrl: env.HUB_URL!.trim().replace(/\/$/, ""),
    token: env.WORKER_TOKEN!.trim(),
    hostname: env.WORKER_HOSTNAME?.trim() || hostname(),
    heartbeatIntervalMs: interval,
    capabilities: list(env.WORKER_CAPABILITIES),
    labels: list(env.WORKER_LABELS),
  };
}
