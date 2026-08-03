import type { ProviderAdapter, ProviderSessionHandle } from "../provider-adapters/provider-adapter";

/** Mirrors the hub's AgentSessionStatus Prisma enum values without depending on @repo/db. */
export type AgentSessionStatus = "RUNNING" | "IDLE" | "FAILED" | "CRASHED" | "STOPPED";

export interface SessionSupervisorDeps {
  adapters: Map<string, ProviderAdapter>;
  onSessionStatus: (sessionId: string, status: AgentSessionStatus) => void;
  onSessionOutput?: (
    sessionId: string,
    sequence: number,
    stream: "stdout" | "stderr",
    content: string,
  ) => void;
  onProviderSessionId?: (sessionId: string, providerSessionId: string) => void;
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
  private readonly providerFailures = new Set<string>();

  constructor(private readonly deps: SessionSupervisorDeps) {}

  start(sessionId: string, provider: string, prompt: string, cwd: string, env?: Record<string, string>, resumeSessionId?: string, outputSequenceStart = 0): void {
    const adapter = this.deps.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unknown provider: "${provider}" — no ProviderAdapter registered for it`);
    }

    let sequence = outputSequenceStart;
    const secret = env?.["SPLINE_AGENT_TOKEN"];
    const pendingOutput: Record<"stdout" | "stderr", string> = {
      stdout: "",
      stderr: "",
    };
    const redact = (content: string) => {
      let safe = secret ? content.replaceAll(secret, "[REDACTED]") : content;
      safe = safe.replace(/agent_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]");
      return safe;
    };
    const emitOutput = (content: string, stream: "stdout" | "stderr") => {
      for (let offset = 0; offset < content.length; offset += 16_384) {
        const safe = redact(content.slice(offset, offset + 16_384));
        if (safe)
          this.deps.onSessionOutput?.(
            sessionId,
            sequence++,
            stream,
            safe,
          );
      }
    };
    let handle: ProviderSessionHandle;
    try {
      handle = adapter.start({
        prompt,
        cwd,
        env,
        resumeSessionId,
        onProviderSessionId: (providerSessionId) =>
          this.deps.onProviderSessionId?.(sessionId, providerSessionId),
        onOutput: (chunk, stream) => {
          if (
            !this.providerFailures.has(sessionId) &&
            /authentication_error|failed to authenticate|oauth access token has been revoked/i.test(
              chunk,
            )
          ) {
            this.providerFailures.add(sessionId);
            this.deps.onSessionStatus(sessionId, "FAILED");
            // Some provider CLIs keep their process alive after emitting a
            // fatal authentication response. Do not leave Spline RUNNING.
            queueMicrotask(() => this.handles.get(sessionId)?.kill("SIGTERM"));
          }
          const combined = redact(pendingOutput[stream] + chunk);
          const lastNewline = combined.lastIndexOf("\n");
          if (lastNewline >= 0) {
            emitOutput(combined.slice(0, lastNewline + 1), stream);
            pendingOutput[stream] = combined.slice(lastNewline + 1);
            return;
          }
          const retainedLength = secret ? Math.max(0, secret.length - 1) : 0;
          const emitLength = Math.max(0, combined.length - retainedLength);
          emitOutput(combined.slice(0, emitLength), stream);
          pendingOutput[stream] = combined.slice(emitLength);
        },
        onExit: (code) => {
          emitOutput(pendingOutput.stdout, "stdout");
          emitOutput(pendingOutput.stderr, "stderr");
          this.handles.delete(sessionId);
          const wasStopRequested = this.stopRequested.delete(sessionId);
          const providerFailed = this.providerFailures.delete(sessionId);
          this.deps.onSessionStatus(
            sessionId,
            providerFailed
              ? "FAILED"
              : this.resolveExitStatus(wasStopRequested, code),
          );
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.onSessionOutput?.(
        sessionId,
        sequence,
        "stderr",
        `[runtime] Impossible de démarrer ${provider}: ${message}\n`,
      );
      this.deps.onSessionStatus(sessionId, "FAILED");
      return;
    }

    this.handles.set(sessionId, handle);
    this.deps.onSessionOutput?.(
      sessionId,
      sequence++,
      "stdout",
      `[runtime] ${provider} démarré dans le sandbox.\n`,
    );
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

  runningSessionIds(): string[] {
    return [...this.handles.keys()];
  }

  private resolveExitStatus(wasStopRequested: boolean, code: number | null): AgentSessionStatus {
    if (wasStopRequested) {
      return "STOPPED";
    }
    if (code === 0) {
      return "IDLE";
    }
    if (code !== null) {
      return "FAILED";
    }
    return "CRASHED";
  }
}
