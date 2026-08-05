/**
 * §10 — the verbs an agent may use to run the collaboration protocol, and
 * nothing else.
 *
 * This list IS the agent's capability surface. The alternative was to give it
 * `curl` and the hub's address, which is arbitrary HTTP with a credential
 * attached — the opposite of §18.12. Here every call it can make is a line in
 * this file, reviewable in one place.
 *
 * Each tool maps to one step of §10.2's cycle. That is not decoration: a tool
 * that fits no step is a capability nobody decided to grant.
 */

export interface HubCall {
  method: "GET" | "POST" | "PATCH";
  /** Relative to the hub, with `:workspaceId` already resolved. */
  path: string;
  body?: Record<string, unknown>;
}

export interface ToolContext {
  workspaceId: string;
  taskId: string;
}

export interface ProtocolTool {
  name: string;
  /** What the agent is told this does. Read by a model, so it is plain. */
  description: string;
  /** Which step of §10.2 it serves — the reason it exists. */
  step: string;
  /** Named arguments, with what each means. */
  parameters: Record<string, { type: "string" | "number"; description: string; required?: boolean }>;
  request(context: ToolContext, args: Record<string, unknown>): HubCall;
}

function text(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

export const PROTOCOL_TOOLS: readonly ProtocolTool[] = [
  {
    name: "synchronize",
    step: "Synchronize (§10.3)",
    description:
      "Read the current state of your task before acting: its status, its acceptance criteria, and what is blocking it. Call this first.",
    parameters: {},
    request: (context) => ({
      method: "GET",
      path: `/workspaces/${context.workspaceId}/tasks/${context.taskId}`,
    }),
  },
  {
    name: "read_workspace",
    step: "Read (§10.4)",
    description:
      "List the tasks of this workspace, to understand what else is in flight and what yours depends on.",
    parameters: {},
    request: (context) => ({
      method: "GET",
      path: `/workspaces/${context.workspaceId}/tasks`,
    }),
  },
  {
    name: "publish_progress",
    step: "Publish (§10.8)",
    description:
      "Say what you are doing and what you have found. Do this as you work — a long silent execution is indistinguishable from one that died.",
    parameters: {
      summary: {
        type: "string",
        description: "What has happened since your last update.",
        required: true,
      },
    },
    request: (context, args) => ({
      method: "POST",
      path: `/workspaces/${context.workspaceId}/events`,
      body: {
        type: "agent.progress",
        severity: "INFO",
        targetType: "TASK",
        targetId: context.taskId,
        payload: { summary: text(args, "summary") },
      },
    }),
  },
  {
    name: "record_decision",
    step: "Plan (§10.5)",
    description:
      "Record a choice you made and why, so somebody reading this later understands the reasoning rather than only the result.",
    parameters: {
      title: { type: "string", description: "The decision, in one line.", required: true },
      rationale: {
        type: "string",
        description: "Why this option and not the others.",
        required: true,
      },
    },
    request: (context, args) => ({
      method: "POST",
      path: `/workspaces/${context.workspaceId}/decisions`,
      body: {
        title: text(args, "title"),
        rationale: text(args, "rationale"),
        taskId: context.taskId,
      },
    }),
  },
  {
    name: "report_blocker",
    step: "Publish (§10.8)",
    description:
      "Report something stopping you that you cannot resolve yourself. This is not a failure — an obstacle nobody knows about is worse than one everybody does.",
    parameters: {
      description: {
        type: "string",
        description: "What is blocking you, concretely.",
        required: true,
      },
    },
    request: (context, args) => ({
      method: "POST",
      path: `/workspaces/${context.workspaceId}/tasks/${context.taskId}/blockers`,
      body: { type: "TECHNICAL", description: text(args, "description") },
    }),
  },
  {
    name: "acquire_lock",
    step: "Acquire (§10.6)",
    description:
      "Take a lock on something before you modify it. Without a lock, no action — two agents changing the same thing is what this prevents.",
    parameters: {
      resourceType: {
        type: "string",
        description: "What kind of thing (for example TASK, REPOSITORY).",
        required: true,
      },
      resourceId: { type: "string", description: "Which one.", required: true },
      reason: { type: "string", description: "Why you need it.", required: true },
    },
    request: (context, args) => ({
      method: "POST",
      path: `/workspaces/${context.workspaceId}/locks`,
      body: {
        resourceType: text(args, "resourceType"),
        resourceId: text(args, "resourceId"),
        reason: text(args, "reason"),
        ttlMs: 15 * 60 * 1000,
      },
    }),
  },
  {
    name: "release_lock",
    step: "Release (§10.10)",
    description:
      "Give back a lock you took, including when you failed. A lock nobody released blocks everyone until it expires.",
    parameters: {
      lockId: { type: "string", description: "The lock you were given.", required: true },
    },
    request: (context, args) => ({
      method: "POST",
      path: `/workspaces/${context.workspaceId}/locks/${text(args, "lockId")}/release`,
    }),
  },
  {
    name: "request_validation",
    step: "Validate (§10.9)",
    description:
      "Submit your work for validation. You never decide that your own work is complete — you submit results and something else decides whether they pass.",
    parameters: {
      type: {
        type: "string",
        description: "The kind of proof (for example unit_test, human_review).",
        required: true,
      },
      summary: { type: "string", description: "What you produced.", required: true },
    },
    request: (context, args) => ({
      method: "POST",
      path: `/workspaces/${context.workspaceId}/validations`,
      body: {
        taskId: context.taskId,
        validationType: text(args, "type"),
        output: { summary: text(args, "summary") },
      },
    }),
  },
];

/**
 * The names Claude Code uses in `--allowedTools`, which is `mcp__<server>__<tool>`.
 * Derived rather than written twice: a list that could disagree with the
 * tools it names would let a tool exist that nothing allows, or allow one
 * that does not exist.
 */
export function allowedToolNames(serverName: string): string[] {
  return PROTOCOL_TOOLS.map((tool) => `mcp__${serverName}__${tool.name}`);
}
