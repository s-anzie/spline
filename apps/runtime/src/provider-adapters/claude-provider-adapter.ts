import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";

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

    const providerSessionId = input.resumeSessionId ?? randomUUID();
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--mcp-config",
      JSON.stringify({
        mcpServers: {
          spline: {
            command: "/run/spline-node",
            args: ["/run/spline-toolkit/mcp-server.js"],
          },
        },
      }),
      "--strict-mcp-config",
      "--allowedTools",
      "CronCreate,CronList,CronDelete,mcp__spline__*",
      ...(input.resumeSessionId
        ? ["--resume", providerSessionId]
        : ["--session-id", providerSessionId]),
    ];
    const child = this.spawnFn("claude", args, { cwd: input.cwd, env });
    input.onProviderSessionId?.(providerSessionId);
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
