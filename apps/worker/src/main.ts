import { arch, platform } from "node:os";
import { statSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";

import { loadConfig, WorkerConfig } from "./config/config";
import { IdentityStore } from "./enrolment/identity-store";
import { executeCommand, ExecutorDeps } from "./execution/executor";
import { pairMachine } from "./enrolment/pairing";
import { HubClient } from "./hub/hub-client";
import { preflightComplaints } from "./supervision/preflight";

loadDotenv();

/**
 * §6.3, §18.2 — makes sure this machine holds a credential, pairing if it
 * does not.
 *
 * A token in the environment wins: that is how a machine provisioned by
 * configuration management skips pairing. Otherwise the stored one is used,
 * and failing that the machine asks — printing a code on its own console for
 * an operator to approve.
 */
async function credentialFor(
  config: WorkerConfig,
  hub: HubClient,
  identities: IdentityStore,
): Promise<string> {
  if (config.token) {
    return config.token;
  }
  const stored = identities.load();
  if (stored?.token) {
    return stored.token;
  }

  const paired = await pairMachine({
    hub,
    machine: {
      deviceId: identities.ensureDeviceId(),
      hostname: config.hostname,
      architecture: arch(),
      operatingSystem: platform(),
      capabilities: config.capabilities,
      labels: config.labels,
    },
    // Remembered on disk, so a restart resumes this request rather than
    // filing another one (§6.3).
    tickets: {
      load: () => identities.loadPendingEnrolment(),
      save: (ticket) => identities.savePendingEnrolment(ticket),
    },
    now: () => new Date(),
    announce: (line) => console.info(line),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    pollIntervalMs: 5_000,
    // Just past the hub's ten-minute window: waiting longer would poll a
    // request that can never be approved.
    maxAttempts: 125,
  });
  if (paired.isFailure) {
    throw new Error(paired.error);
  }

  identities.saveCredential(paired.value.token, paired.value.actorId);
  console.info(`paired: this machine is now ${paired.value.actorId}`);
  return paired.value.token;
}

/**
 * §6.2 — `OFFLINE → CONNECTING → REGISTERING → READY`. What this daemon does
 * today is the left half of that: it pairs if it must, announces itself and
 * keeps saying it is there.
 *
 * Deliberately not a framework: a daemon with one responsibility does not
 * need dependency injection to hold three objects.
 */
async function main(): Promise<void> {
  // Reading configuration acts on nothing; it only decides whether there is
  // anything to check. Both files below come from it.
  const config = loadConfig();

  /**
   * §18 — before this daemon does anything. Running as root or leaving a
   * credential world-readable makes every other control here decorative, and
   * both are misconfigurations an operator cannot see from the outside.
   * Refused rather than warned: a worker that starts anyway is a worker
   * nobody will ever go back and fix.
   */
  const complaints = preflightComplaints({
    uid: process.getuid?.(),
    statMode: (path) => statSync(path).mode,
    // Both places a credential can live: the environment file an operator
    // wrote, and the state file this daemon wrote for itself.
    secretFiles: [resolve(process.cwd(), ".env"), config.statePath],
  });
  if (complaints.length > 0) {
    throw new Error(`refusing to start:\n- ${complaints.join("\n- ")}`);
  }

  const identities = new IdentityStore(config.statePath);
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

  hub.useToken(await credentialFor(config, hub, identities));

  const workerId = await hub.register({
    capabilities: config.capabilities,
    labels: config.labels,
  });
  console.info(`registered with the hub as ${workerId} (${config.hostname})`);

  /**
   * §6.8 — pull, execute, report. One order at a time: running two at once
   * would let them share a workspace directory, and §7.9's file isolation is
   * per workspace, not per order.
   *
   * `busy` rather than a queue: an order this worker never claimed stays
   * PENDING for it, or goes to another machine. Claiming work it cannot start
   * would be taking it out of everyone's reach (§6.6).
   */
  const executor: ExecutorDeps = {
    settings: {
      backend: config.backend,
      containerRuntime: config.containerRuntime,
      containerImage: config.containerImage,
      containerMemory: config.containerMemory,
      containerCpus: config.containerCpus,
      containerPids: config.containerPids,
      containerUser: config.containerUser,
      allowedCommands: config.allowedCommands,
    },
    limits: {
      timeoutMs: config.taskTimeoutMs,
      maxOutputBytes: config.maxOutputBytes,
    },
    workspaceRoot: config.workspaceRoot,
    /**
     * §18.4 — replaced below, per order. The executor takes a synchronous
     * resolver because a plan is built synchronously; the secrets are
     * fetched before the plan, so by then there is nothing to await.
     */
    secretsFor: () => ({}),
  };

  let busy = false;
  const pump = setInterval(() => {
    if (busy) {
      return;
    }
    busy = true;
    void hub
      .claimCommands(1)
      .then(async (commands) => {
        for (const command of commands) {
          /**
           * §18.4 — fetched now, for THIS order, and held only long enough to
           * put in the child's environment. Never written anywhere: not to
           * the state file, not to a log, not back to the hub.
           */
          let secrets: Record<string, string> = {};
          try {
            secrets = await hub.commandSecrets(command.id);
          } catch (error) {
            // A credential the hub will not give is a refusal to run, not a
            // reason to run without it: a provider without its key fails
            // somewhere far from the cause (§18.4).
            await hub.reportCommand(command.id, {
              outcome: "FAILED",
              failureReason: `could not obtain this order's secrets: ${String(error)}`,
            });
            console.warn(`${command.type} (${command.id}): no secrets — declined`);
            continue;
          }

          const report = await executeCommand(command, {
            ...executor,
            secretsFor: () => secrets,
            /**
             * §10 — the protocol bridge, opened only if the hub grants one.
             * An order that belongs to no task gets none, and the agent then
             * runs with no tools rather than with tools that all fail.
             */
            grantFor: async () => {
              try {
                const granted = await hub.commandGrant(command.id);
                return {
                  token: granted.token,
                  hubUrl: config.hubUrl,
                  serverCommand: process.execPath,
                  serverArgs: [config.mcpServerPath],
                };
              } catch {
                return null;
              }
            },
          });
          await hub.reportCommand(
            command.id,
            report.outcome === "COMPLETED"
              ? { outcome: "COMPLETED", result: report.result ?? {} }
              : { outcome: "FAILED", failureReason: report.failureReason ?? "unknown" },
          );
          console.info(
            `${command.type} (${command.id}): ${report.outcome}${
              report.failureReason ? ` — ${report.failureReason}` : ""
            }`,
          );
        }
      })
      .catch((error: unknown) => {
        console.error(`claiming commands failed: ${String(error)}`);
      })
      .finally(() => {
        busy = false;
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
