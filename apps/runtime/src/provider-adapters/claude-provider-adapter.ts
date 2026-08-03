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
    const readOnly = input.env?.["SPLINE_AGENT_ROLE"] === "observer";
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      // Provider sessions are deliberately non-interactive: stdin carries the
      // initial prompt and is then closed. Any permission prompt would be
      // impossible to answer and would strand the task. Bubblewrap is the
      // actual security boundary (only the workspace is writable), so Claude
      // can safely bypass its redundant interactive approval layer inside it.
      "--allow-dangerously-skip-permissions",
      "--dangerously-skip-permissions",
      "--permission-mode",
      "bypassPermissions",
      // Do not inherit host/project permission rules, hooks or plugins. Those
      // belong to an interactive developer session and can silently turn a
      // daemon session back into an approval-gated one.
      "--setting-sources",
      "",
      "--disable-slash-commands",
      "--tools",
      "default",
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
      ...(readOnly
        ? [
            "--disallowedTools",
            "Bash,Edit,Write,NotebookEdit",
          ]
        : []),
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
