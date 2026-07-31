import type { ProviderAdapter, ProviderSessionHandle } from "../provider-adapters/provider-adapter";

/** Mirrors the hub's AgentSessionStatus Prisma enum values without depending on @repo/db. */
export type AgentSessionStatus = "RUNNING" | "COMPLETED" | "FAILED" | "CRASHED" | "STOPPED";

export interface SessionSupervisorDeps {
  adapters: Map<string, ProviderAdapter>;
  onSessionStatus: (sessionId: string, status: AgentSessionStatus) => void;
}

/**
 * Tracks running agent-provider sessions by sessionId. Unlike ReportProcessExitedUseCase
 * (which infers STOPPED vs CRASHED server-side from Process.status), ReportSessionStatusUseCase
 * trusts whatever status it's given — so this supervisor, not the hub, decides
 * COMPLETED/FAILED/CRASHED/STOPPED from the exit code/signal and whether stop() was called first.
 */
export class SessionSupervisor {
  private readonly handles = new Map<string, ProviderSessionHandle>();
  private readonly stopRequested = new Set<string>();

  constructor(private readonly deps: SessionSupervisorDeps) {}

  start(sessionId: string, provider: string, prompt: string, cwd: string, env?: Record<string, string>): void {
    const adapter = this.deps.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unknown provider: "${provider}" — no ProviderAdapter registered for it`);
    }

    const handle = adapter.start({
      prompt,
      cwd,
      env,
      onOutput: () => {},
      onExit: (code) => {
        this.handles.delete(sessionId);
        const wasStopRequested = this.stopRequested.delete(sessionId);
        this.deps.onSessionStatus(sessionId, this.resolveExitStatus(wasStopRequested, code));
      },
    });

    this.handles.set(sessionId, handle);
    this.deps.onSessionStatus(sessionId, "RUNNING");
  }

  stop(sessionId: string, signal: NodeJS.Signals = "SIGTERM"): void {
    const handle = this.handles.get(sessionId);
    if (!handle) {
      return;
    }
    this.stopRequested.add(sessionId);
    handle.kill(signal);
  }

  isRunning(sessionId: string): boolean {
    return this.handles.has(sessionId);
  }

  private resolveExitStatus(wasStopRequested: boolean, code: number | null): AgentSessionStatus {
    if (wasStopRequested) {
      return "STOPPED";
    }
    if (code === 0) {
      return "COMPLETED";
    }
    if (code !== null) {
      return "FAILED";
    }
    return "CRASHED";
  }
}
