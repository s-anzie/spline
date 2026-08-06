import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ToolSurface } from "../providers/provider-spec";
import { allowedToolNames } from "./protocol-tools";
import { workTools } from "./work-tools";

/** The server's name, which becomes part of every tool name the agent sees. */
export const SERVER_NAME = "spline";

export interface McpBridgeInput {
  /** Where the config file goes. Inside the run's own directory. */
  directory: string;
  hubUrl: string;
  workspaceId: string;
  taskId: string;
  /** §18.10 — the agent's own credential, for this task, for an hour. */
  grantToken: string;
  /**
   * What that credential actually carries, as the hub computed it.
   *
   * Passed down so the bridge offers only the tools this agent may use: a
   * contributor never sees `cut_task`, and a manager does. Absent means "all
   * of them", which is what an older hub answers — safe, since every call is
   * checked again on arrival.
   */
  grantScopes?: readonly string[];
  /** How the server is started. Injected so a test needs no built bundle. */
  serverCommand: string;
  serverArgs: readonly string[];
}

/**
 * §18.4, §18.12 — writes the bridge that lets an agent run the protocol, and
 * keeps its credential out of everything that can be read.
 *
 * The token is the whole difficulty. `--mcp-config` accepts a JSON **string**,
 * which would put the credential in the CLI's argv — visible in `ps` to every
 * account on the machine, which is the exact objection that keeps secrets out
 * of command payloads. So the config is a FILE, mode 0600, and only its path
 * is passed.
 *
 * The token also stays out of the agent's OWN environment. It lives in the
 * `env` of the MCP server the agent spawns, so the agent process never holds
 * it — an agent that found a way to read its own environment would find
 * nothing. It can USE the credential through the tools; it can never see it.
 */
export function writeMcpBridge(input: McpBridgeInput): ToolSurface {
  const path = join(input.directory, ".spline", "mcp.json");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });

  const config = {
    mcpServers: {
      [SERVER_NAME]: {
        command: input.serverCommand,
        args: [...input.serverArgs],
        env: {
          SPLINE_HUB_URL: input.hubUrl,
          SPLINE_WORKSPACE_ID: input.workspaceId,
          SPLINE_TASK_ID: input.taskId,
          SPLINE_GRANT_TOKEN: input.grantToken,
          // Read by the server to decide which tools to register at all.
          ...(input.grantScopes ? { SPLINE_GRANT_SCOPES: input.grantScopes.join(",") } : {}),
        },
      },
    },
  };

  // Owner-only, and written before it is named: a file that existed readable
  // for even a moment was readable.
  writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });

  return {
    // The PATH, never the JSON: see above. `ToolSurface` has no field that
    // could carry the config inline, which is what makes this unforgettable.
    mcpConfigPath: path,
    /**
     * Both halves, and the second one is the one that was missing: how the
     * agent SAYS what it is doing, and how it actually does it. See
     * `work-tools.ts` for the run that proved a surface with only the first
     * half is a surface that changes nothing.
     */
    allowedTools: [
      ...allowedToolNames(SERVER_NAME, input.grantScopes),
      ...workTools(input.grantScopes),
    ],
  };
}
