import { config as loadDotenv } from "dotenv";

import { loadConfig } from "./config/config";
import { HubClient } from "./hub/hub-client";

loadDotenv();

/**
 * §6.2 — `OFFLINE → CONNECTING → REGISTERING → READY`. What this daemon does
 * today is the left half of that: it announces itself and keeps saying it is
 * there. Receiving orders needs the hub to have commands to send (§6.8), and
 * it has none yet.
 *
 * Deliberately not a framework: a daemon with one responsibility does not
 * need dependency injection to hold two objects.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const hub = new HubClient(config);

  const workerId = await hub.register({
    capabilities: config.capabilities,
    labels: config.labels,
  });
  console.info(`registered with the hub as ${workerId} (${config.hostname})`);

  const beat = setInterval(() => {
    // The interval callback cannot be async without leaving a floating
    // promise: a failed heartbeat is reported, never thrown into nothing.
    void hub.heartbeat().catch((error: unknown) => {
      console.error(`heartbeat failed: ${String(error)}`);
    });
  }, config.heartbeatIntervalMs);

  const stop = (signal: string): void => {
    clearInterval(beat);
    console.info(`${signal}: stopping`);
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
}

main().catch((error: unknown) => {
  // A worker that cannot reach its hub must fail loudly and stop: staying up
  // while doing nothing is the silence §9.16 warns about, one level down.
  console.error(String(error));
  process.exit(1);
});
