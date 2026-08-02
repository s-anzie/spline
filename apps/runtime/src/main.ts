import { CommandDispatcher } from "./command-dispatcher";
import { HubConnection } from "./hub-connection";
import { GenericCommandRunner } from "./process-supervisor/generic-command-runner";
import { ProcessSupervisor } from "./process-supervisor/process-supervisor";
import { SessionSupervisor } from "./process-supervisor/session-supervisor";
import type { ProviderAdapter } from "./provider-adapters/provider-adapter";
import { ClaudeProviderAdapter } from "./provider-adapters/claude-provider-adapter";
import { CodexProviderAdapter } from "./provider-adapters/codex-provider-adapter";
import { createBubblewrapSpawn } from "./provider-adapters/bubblewrap-sandbox";
import {
  readRuntimeConfig,
  type RuntimeConfig,
  runtimeConfigPath,
  watchRuntimeConfig,
} from "./runtime-config";

const HEARTBEAT_INTERVAL_MS = Number(
  process.env["HEARTBEAT_INTERVAL_MS"] ?? 15000,
);
const UNKNOWN_EXIT_CODE = -1;

function main(): void {
  let hub: HubConnection | null = null;
  let activeSignature = "";
  let currentConfig: RuntimeConfig = readRuntimeConfig();
  const processSupervisor = new ProcessSupervisor({
    runner: new GenericCommandRunner(),
    onProcessStarted: (processId, pid) =>
      hub?.reportProcessStarted(processId, pid),
    onProcessExited: (processId, exitCode) =>
      hub?.reportProcessExited(processId, exitCode ?? UNKNOWN_EXIT_CODE),
  });
  const sandboxedSpawn = createBubblewrapSpawn();
  const adapters = new Map<string, ProviderAdapter>([
    ["claude", new ClaudeProviderAdapter(sandboxedSpawn)],
    ["codex", new CodexProviderAdapter(sandboxedSpawn)],
  ]);
  const sessionSupervisor = new SessionSupervisor({
    adapters,
    onSessionStatus: (sessionId, status) =>
      hub?.reportSessionStatus(sessionId, status),
    onSessionOutput: (sessionId, sequence, stream, content) =>
      hub?.reportSessionOutput(sessionId, sequence, stream, content),
    onProviderSessionId: (sessionId, providerSessionId) =>
      hub?.reportProviderSessionId(sessionId, providerSessionId),
  });
  const dispatcher = new CommandDispatcher({
    processSupervisor,
    sessionSupervisor,
    onError: (error, command) =>
      console.error(
        `[runtime] command ${command.id} (${command.type}) failed:`,
        error,
      ),
    resolveAgentEnvironment: (agentId, workspaceId) => {
      const token = currentConfig.agentTokens?.[agentId];
      if (!token) {
        throw new Error(
          `No local token configured for agent ${agentId}. Run: npm run agent-token:set -w apps/runtime -- ${agentId}`,
        );
      }
      return {
        SPLINE_API_URL: currentConfig.hubUrl,
        SPLINE_AGENT_TOKEN: token,
        SPLINE_AGENT_ID: agentId,
        SPLINE_WORKSPACE_ID: workspaceId,
      };
    },
  });

  function applyConfig(): void {
    try {
      const config = readRuntimeConfig();
      currentConfig = config;
      const signature = `${config.hubUrl}\0${config.machineToken ?? ""}`;
      if (signature === activeSignature) return;
      activeSignature = signature;
      hub?.disconnect();
      hub = null;
      if (!config.machineToken) {
        console.warn(
          `[runtime] waiting for a machine token; run the token:set command (config: ${runtimeConfigPath()})`,
        );
        return;
      }
      const nextHub = new HubConnection(config.hubUrl, config.machineToken);
      nextHub.onCommand((command) => dispatcher.dispatch(command));
      nextHub.onConnect(() => {
        console.log(`[runtime] connected to ${config.hubUrl}/machines`);
        // Signal readiness before asking the hub to deliver queued commands.
        // Commands emitted from the server's connection hook can arrive before
        // the Socket.IO client has entered its connected state and be lost.
        nextHub.sendMachineHeartbeat();
        nextHub.reportRuntimeInventory(sessionSupervisor.runningSessionIds());
      });
      nextHub.connect();
      hub = nextHub;
      console.log(`[runtime] connecting to ${config.hubUrl}/machines…`);
    } catch (error) {
      console.error("[runtime] configuration reload failed:", error);
    }
  }

  applyConfig();
  const stopWatching = process.env["MACHINE_TOKEN"]
    ? () => undefined
    : watchRuntimeConfig(applyConfig);
  const heartbeat = setInterval(
    () => hub?.sendMachineHeartbeat(),
    HEARTBEAT_INTERVAL_MS,
  );
  const shutdown = () => {
    clearInterval(heartbeat);
    void stopWatching();
    hub?.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
