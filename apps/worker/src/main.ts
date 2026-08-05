import { statSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";

import { loadConfig } from "./config/config";
import { HubClient } from "./hub/hub-client";
import { preflightComplaints } from "./supervision/preflight";

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
  /**
   * §18 — before anything else. Running as root or leaving the token
   * world-readable makes every other control in this daemon decorative, and
   * both are misconfigurations an operator cannot see from the outside.
   * Refused rather than warned: a worker that starts anyway is a worker
   * nobody will ever go back and fix.
   */
  const complaints = preflightComplaints({
    uid: process.getuid?.(),
    statMode: (path) => statSync(path).mode,
    secretFiles: [resolve(process.cwd(), ".env")],
  });
  if (complaints.length > 0) {
    throw new Error(`refusing to start:\n- ${complaints.join("\n- ")}`);
  }

  const config = loadConfig();
  const hub = new HubClient(config);

  if (config.allowedCommands.length === 0) {
    // Not fatal: a worker with no allowlist is still useful for presence and
    // reporting. Said out loud because silence would read as "it works".
    console.warn(
      "WORKER_ALLOWED_COMMANDS is empty: this machine will refuse every order " +
        "that asks it to run a program (§18.1).",
    );
  }

  /**
   * §18.5 — the one line that tells an operator what this machine actually
   * protects. A worker that quietly ran tasks on the host would look
   * identical to one that isolates them, right up until it mattered.
   */
  if (config.backend === "host") {
    console.warn(
      "EXECUTION_BACKEND=host: tasks run directly on this machine. The " +
        "allowlist, the environment rules and the timeouts still apply, but " +
        "there is NO boundary — a task can reach the network, the rest of " +
        "the disk, and this machine's resources (§18.5).",
    );
  } else {
    console.info(
      `tasks run in ${config.containerRuntime} (${config.containerImage || "no image configured"}), ` +
        `network none, ${config.containerMemory} memory, ${config.containerPids} processes`,
    );
  }

  const workerId = await hub.register({
    capabilities: config.capabilities,
    labels: config.labels,
  });
  console.info(`registered with the hub as ${workerId} (${config.hostname})`);

  // §6.8 — pull, execute, report. One order at a time for now: running two
  // at once needs isolation this daemon does not yet build (§7.9), and
  // pretending otherwise would let two sessions share an environment.
  const pump = setInterval(() => {
    void hub
      .claimCommands(1)
      .then(async (commands) => {
        for (const command of commands) {
          // Nothing executes them yet: the spawn and failure-reading pieces
          // are written and tested, but wiring an executor before the order
          // types are settled would guess at their payloads. Reported as
          // failed rather than silently swallowed — an order that vanishes is
          // exactly what §6.6 forbids.
          await hub.reportCommand(command.id, {
            outcome: "FAILED",
            failureReason: `${command.type} is not executable by this worker yet`,
          });
          console.warn(`declined ${command.type} (${command.id}): no executor`);
        }
      })
      .catch((error: unknown) => {
        console.error(`claiming commands failed: ${String(error)}`);
      });
  }, config.heartbeatIntervalMs);

  const beat = setInterval(() => {
    // The interval callback cannot be async without leaving a floating
    // promise: a failed heartbeat is reported, never thrown into nothing.
    void hub.heartbeat().catch((error: unknown) => {
      console.error(`heartbeat failed: ${String(error)}`);
    });
  }, config.heartbeatIntervalMs);

  const stop = (signal: string): void => {
    clearInterval(beat);
    clearInterval(pump);
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
