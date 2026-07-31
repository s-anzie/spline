import type { CommandHandle, StartCommandInput } from "./generic-command-runner";
import { isProcessAlive } from "./is-process-alive";

export interface CommandRunner {
  start(input: StartCommandInput): CommandHandle;
}

export interface ProcessSupervisorDeps {
  runner: CommandRunner;
  onProcessStarted: (processId: string, pid: number) => void;
  onProcessExited: (processId: string, exitCode: number | null) => void;
}

/** Tracks running child processes by processId; owns no reporting transport itself. */
export class ProcessSupervisor {
  private readonly handles = new Map<string, CommandHandle>();

  constructor(
    private readonly deps: ProcessSupervisorDeps,
    private readonly isAliveProbe: (pid: number) => boolean = isProcessAlive,
  ) {}

  start(processId: string, command: string, cwd: string, env?: Record<string, string>): void {
    const handle = this.deps.runner.start({
      command,
      cwd,
      env,
      onOutput: () => {},
      onExit: (code) => {
        this.handles.delete(processId);
        this.deps.onProcessExited(processId, code);
      },
    });

    this.handles.set(processId, handle);
    this.deps.onProcessStarted(processId, handle.pid);
  }

  stop(processId: string, signal: NodeJS.Signals = "SIGTERM"): void {
    this.handles.get(processId)?.kill(signal);
  }

  isRunning(processId: string): boolean {
    return this.handles.has(processId);
  }

  /** Real OS-level probe (process.kill(pid, 0)) rather than relying solely on our internal exit bookkeeping. */
  isAlive(processId: string): boolean {
    const handle = this.handles.get(processId);
    if (!handle) {
      return false;
    }
    return this.isAliveProbe(handle.pid);
  }
}
