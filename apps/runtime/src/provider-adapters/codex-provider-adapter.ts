import { spawn as nodeSpawn } from "node:child_process";

import type { ProviderAdapter, ProviderSessionHandle, SpawnFn, StartSessionInput } from "./provider-adapter";

export class CodexProviderAdapter implements ProviderAdapter {
  readonly provider = "codex";

  constructor(private readonly spawnFn: SpawnFn = nodeSpawn) {}

  start(input: StartSessionInput): ProviderSessionHandle {
    const env: Record<string, string> = {
      PATH: process.env["PATH"] ?? "",
      HOME: process.env["HOME"] ?? "",
      ...input.env,
    };

    const mcpArgs = [
      // Spline already runs Codex inside its own Bubblewrap boundary. A
      // second Codex sandbox blocks loopback and prevents the MCP child from
      // reaching the local Spline API. This flag is explicitly intended for
      // externally sandboxed automation; the outer boundary remains active.
      "--dangerously-bypass-approvals-and-sandbox",
      // Runtime agents must not inherit a developer's interactive Codex
      // policy, hooks, MCP servers or exec rules. Authentication still comes
      // from the isolated CODEX_HOME mounted by Bubblewrap.
      "--ignore-user-config",
      "--ignore-rules",
      "--strict-config",
      "-c",
      'mcp_servers.spline.command="/run/spline-node"',
      "-c",
      'mcp_servers.spline.args=["/run/spline-toolkit/mcp-server.js"]',
      "-c",
      'mcp_servers.spline.env_vars=["SPLINE_API_URL","SPLINE_WORKSPACE_ID","SPLINE_AGENT_ID","SPLINE_AGENT_TOKEN","SPLINE_AGENT_ROLE"]',
      "-c",
      "mcp_servers.spline.required=true",
    ];
    const args = input.resumeSessionId
      ? ["exec", "resume", input.resumeSessionId, "-", "--json", ...mcpArgs]
      : ["exec", "-", "--json", ...mcpArgs];
    const child = this.spawnFn("codex", args, { cwd: input.cwd, env });
    // Codex appends piped stdin to an argv prompt and waits for EOF. Supplying
    // the prompt exclusively through stdin and closing it makes exec truly
    // non-interactive, while also avoiding the OS argv size limit.
    child.stdin?.write(input.prompt);
    child.stdin?.end();

    let stdoutBuffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuffer += text;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as { type?: string; thread_id?: string };
          if (event.type === "thread.started" && event.thread_id)
            input.onProviderSessionId?.(event.thread_id);
        } catch {
          // Keep malformed or human-readable lines visible in the console.
        }
      }
      input.onOutput(text, "stdout");
    });
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
