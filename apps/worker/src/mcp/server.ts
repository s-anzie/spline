import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { HubCall, PROTOCOL_TOOLS, ToolContext, toolsFor } from "./protocol-tools";

/**
 * §10, §18.12 — the bridge an agent uses to run the protocol.
 *
 * A separate process, spawned by the CLI, holding the task grant. The agent
 * can USE the credential through these tools and can never see it: the token
 * is in this process's environment, not in the agent's.
 *
 * The alternative was to hand the agent `curl` and the hub's address, which
 * is arbitrary HTTP with a credential attached. Every call it can make is now
 * a line in `protocol-tools.ts`.
 */

interface Settings {
  hubUrl: string;
  context: ToolContext;
  grantToken: string;
  /** Absent means every tool: an older hub sends no scope list. */
  scopes?: readonly string[];
}

function settingsFrom(env: NodeJS.ProcessEnv): Settings {
  const missing = [
    "SPLINE_HUB_URL",
    "SPLINE_WORKSPACE_ID",
    "SPLINE_TASK_ID",
    "SPLINE_GRANT_TOKEN",
  ].filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    // Refused loudly: a bridge that started without its credential would
    // answer every tool call with an authentication error, and the agent
    // would report a hub that is "down".
    throw new Error(`the Spline MCP bridge is missing: ${missing.join(", ")}`);
  }
  return {
    hubUrl: env.SPLINE_HUB_URL!.trim().replace(/\/$/, ""),
    context: {
      workspaceId: env.SPLINE_WORKSPACE_ID!.trim(),
      taskId: env.SPLINE_TASK_ID!.trim(),
    },
    grantToken: env.SPLINE_GRANT_TOKEN!.trim(),
    // Absent on purpose when the hub said nothing: see `toolsFor`.
    ...(env.SPLINE_GRANT_SCOPES?.trim()
      ? {
          scopes: env.SPLINE_GRANT_SCOPES.split(",")
            .map((scope) => scope.trim())
            .filter(Boolean),
        }
      : {}),
  };
}

/**
 * Calls the hub with the grant. Errors come back as TEXT rather than as
 * thrown exceptions: a tool that throws tells the agent nothing it can act
 * on, while "403: this grant does not carry manage_tasks" tells it exactly
 * what it may not do (§20.6).
 */
export async function callHub(
  settings: Settings,
  call: HubCall,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${settings.hubUrl}${call.path}`, {
      method: call.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${settings.grantToken}`,
      },
      ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      // §18 — a redirect is somebody else asking where to send the credential.
      redirect: "error",
    });
  } catch (error) {
    return `The hub could not be reached: ${String(error)}`;
  }

  const body = await response.text();
  return response.ok ? body : `${response.status}: ${body}`;
}

/** Builds the zod shape a tool declares, from its own parameter list. */
function shapeOf(tool: (typeof PROTOCOL_TOOLS)[number]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, spec] of Object.entries(tool.parameters)) {
    /**
     * A declared type that fell through to `z.string()` would let a tool
     * advertise a boolean and receive the word "true" — which is truthy for
     * every string, including "false". Named rather than defaulted.
     */
    const base =
      spec.type === "number"
        ? z.number()
        : spec.type === "boolean"
          ? z.boolean()
          : z.string();
    shape[name] = spec.required
      ? base.describe(spec.description)
      : base.optional().describe(spec.description);
  }
  return shape;
}

export function buildServer(settings: Settings): McpServer {
  const server = new McpServer({ name: "spline", version: "1.0.0" });

  for (const tool of toolsFor(settings.scopes)) {
    server.registerTool(
      tool.name,
      {
        description: `${tool.description} [${tool.step}]`,
        inputSchema: shapeOf(tool),
      },
      async (args: Record<string, unknown>) => ({
        content: [
          { type: "text" as const, text: await callHub(settings, tool.request(settings.context, args)) },
        ],
      }),
    );
  }

  return server;
}

/* c8 ignore start — the entry point; everything it composes is tested above. */
async function main(): Promise<void> {
  const server = buildServer(settingsFrom(process.env));
  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // stderr, never stdout: stdout is the protocol channel, and a message on
    // it would corrupt the transport rather than report the problem.
    console.error(String(error));
    process.exit(1);
  });
}
/* c8 ignore stop */

export { settingsFrom };
