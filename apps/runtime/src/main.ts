import { CommandDispatcher } from "./command-dispatcher";
import { HubConnection } from "./hub-connection";
import { GenericCommandRunner } from "./process-supervisor/generic-command-runner";
import { ProcessSupervisor } from "./process-supervisor/process-supervisor";
import { SessionSupervisor } from "./process-supervisor/session-supervisor";
import type { ProviderAdapter } from "./provider-adapters/provider-adapter";
import { ClaudeProviderAdapter } from "./provider-adapters/claude-provider-adapter";
import { CodexProviderAdapter } from "./provider-adapters/codex-provider-adapter";

const HEARTBEAT_INTERVAL_MS = Number(process.env["HEARTBEAT_INTERVAL_MS"] ?? 15000);
/** child_process reports exitCode=null when killed by a signal; the hub's process_exited contract wants a number. */
const UNKNOWN_EXIT_CODE = -1;

function main(): void {
  const hubUrl = process.env["HUB_URL"];
  const machineToken = process.env["MACHINE_TOKEN"];
  if (!hubUrl || !machineToken) {
    throw new Error("HUB_URL and MACHINE_TOKEN environment variables are required");
  }

  const hub = new HubConnection(hubUrl, machineToken);

  const processSupervisor = new ProcessSupervisor({
    runner: new GenericCommandRunner(),
    onProcessStarted: (processId, pid) => hub.reportProcessStarted(processId, pid),
    onProcessExited: (processId, exitCode) => hub.reportProcessExited(processId, exitCode ?? UNKNOWN_EXIT_CODE),
  });

  const adapters = new Map<string, ProviderAdapter>();
  adapters.set("claude", new ClaudeProviderAdapter());
  adapters.set("codex", new CodexProviderAdapter());
  const sessionSupervisor = new SessionSupervisor({
    adapters,
    onSessionStatus: (sessionId, status) => hub.reportSessionStatus(sessionId, status),
  });

  const dispatcher = new CommandDispatcher({
    processSupervisor,
    sessionSupervisor,
    onError: (error, command) => {
      console.error(`[runtime] command ${command.id} (${command.type}) failed:`, error);
    },
  });

  hub.onCommand((command) => dispatcher.dispatch(command));
  hub.connect();

  const heartbeat = setInterval(() => hub.sendMachineHeartbeat(), HEARTBEAT_INTERVAL_MS);

  const shutdown = () => {
    clearInterval(heartbeat);
    hub.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
