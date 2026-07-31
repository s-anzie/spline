import type { ChildProcess } from "node:child_process";

export type OutputStream = "stdout" | "stderr";

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string> },
) => ChildProcess;

export interface StartSessionInput {
  prompt: string;
  cwd: string;
  /** Caller-specified env only — never the daemon's own full process.env (would leak secrets to the session). */
  env?: Record<string, string>;
  onOutput: (chunk: string, stream: OutputStream) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export interface ProviderSessionHandle {
  pid: number;
  kill(signal?: NodeJS.Signals): void;
}

export interface ProviderAdapter {
  readonly provider: string;
  start(input: StartSessionInput): ProviderSessionHandle;
}
