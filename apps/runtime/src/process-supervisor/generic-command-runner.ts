import { spawn as nodeSpawn } from "node:child_process";

import { parse as shellQuoteParse } from "shell-quote";

import type { SpawnFn } from "../provider-adapters/provider-adapter";

export interface StartCommandInput {
  command: string;
  cwd: string;
  /** Caller-specified env only — never the daemon's own full process.env (would leak secrets to the child process). */
  env?: Record<string, string>;
  onOutput: (chunk: string, stream: "stdout" | "stderr") => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export interface CommandHandle {
  pid: number;
  kill(signal?: NodeJS.Signals): void;
}

/** Tokenizes Process.command via shell-quote — never spawn(..., { shell: true }). */
export class GenericCommandRunner {
  constructor(private readonly spawnFn: SpawnFn = nodeSpawn) {}

  start(input: StartCommandInput): CommandHandle {
    const [program, ...args] = this.tokenize(input.command);

    const env: Record<string, string> = {
      PATH: process.env["PATH"] ?? "",
      HOME: process.env["HOME"] ?? "",
      ...input.env,
    };

    const child = this.spawnFn(program as string, args, { cwd: input.cwd, env });

    child.stdout?.on("data", (chunk: Buffer) => input.onOutput(chunk.toString(), "stdout"));
    child.stderr?.on("data", (chunk: Buffer) => input.onOutput(chunk.toString(), "stderr"));
    child.on("exit", (code, signal) => input.onExit(code, signal));

    return {
      pid: child.pid as number,
      kill: (signal?: NodeJS.Signals) => {
        child.kill(signal);
      },
    };
  }

  private tokenize(command: string): string[] {
    const tokens = shellQuoteParse(command);
    const words = tokens.map((token) => {
      if (typeof token !== "string") {
        throw new Error(
          `Unsupported command syntax: shell operators/redirections are not honored without a real shell (command: ${command})`,
        );
      }
      return token;
    });

    if (words.length === 0) {
      throw new Error(`Empty command after tokenization: "${command}"`);
    }

    return words;
  }
}
