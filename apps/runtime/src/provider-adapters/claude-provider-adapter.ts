import { spawn as nodeSpawn } from "node:child_process";

import type { ProviderAdapter, ProviderSessionHandle, SpawnFn, StartSessionInput } from "./provider-adapter";

export class ClaudeProviderAdapter implements ProviderAdapter {
  readonly provider = "claude";

  constructor(private readonly spawnFn: SpawnFn = nodeSpawn) {}

  start(input: StartSessionInput): ProviderSessionHandle {
    const env: Record<string, string> = {
      PATH: process.env["PATH"] ?? "",
      HOME: process.env["HOME"] ?? "",
      ...input.env,
    };

    const child = this.spawnFn("claude", ["--print"], { cwd: input.cwd, env });
    child.stdin?.write(input.prompt);
    child.stdin?.end();

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
}
