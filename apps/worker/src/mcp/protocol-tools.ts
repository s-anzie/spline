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
  /**
   * The permission this tool spends.
   *
   * The bridge serves a tool only when the grant actually carries its scope,
   * and the grant is the intersection of what was asked for with what the
   * actor's ROLE holds. So a contributor never sees the organising tools —
   * not because a list somewhere excludes it, but because its role does.
   */
  scope: string;
  /** Named arguments, with what each means. */
  parameters: Record<
    string,
    { type: "string" | "number" | "list"; description: string; required?: boolean }
  >;
  request(context: ToolContext, args: Record<string, unknown>): HubCall;
}

function text(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

/**
 * A list, however the model chose to send it.
 *
 * Models write `["a","b"]`, `"a, b"` and `"a\nb"` interchangeably, and the
 * hub refuses an empty array — so a manager whose criteria arrived as one
 * string would be told its own task is malformed and have no idea why.
 */
function list(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (Array.isArray(value)) {
    return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(/\r?\n|;|(?<!\d),(?!\d)/)
    .map((entry) => entry.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter(Boolean);
}

export const PROTOCOL_TOOLS: readonly ProtocolTool[] = [
  {
    name: "synchronize",
    scope: "read_workspace_state",
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
    scope: "read_workspace_state",
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
    scope: "contribute_knowledge",
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
    scope: "record_decisions",
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
    scope: "contribute_knowledge",
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
    scope: "acquire_locks",
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
    scope: "acquire_locks",
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
    scope: "request_validation",
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
  /* ── Organising the work (§4.5, §4.6). A manager only. ────────────────────
   *
   * These are the difference between an agent that does one task and a team
   * that gets given a need. They spend `manage_goals` / `manage_tasks`, which
   * only `AGENT_MANAGER` holds, so the bridge simply does not serve them to
   * anybody else — the leash is the role, checked twice: here when the tools
   * are chosen, and again by the hub on every call.
   */
  {
    name: "state_goal",
    step: "Organise (§4.5)",
    scope: "manage_goals",
    description:
      "Turn the need you were given into a goal: what is wanted, and what would prove it was reached. Do this once, before cutting any tasks — every task belongs to a goal.",
    parameters: {
      title: { type: "string", description: "The outcome, in one line", required: true },
      description: {
        type: "string",
        description: "The need in full, including the constraints you were told about",
      },
      successCriteria: {
        type: "list",
        description:
          "What a person will check before calling this done. At least one, each checkable on its own.",
        required: true,
      },
      parentGoalId: {
        type: "string",
        description:
          "The goal this one serves, when a need turns out to be several. Leave it out for a goal that stands on its own.",
      },
    },
    request: (context, args) => ({
      method: "POST",
      path: `/workspaces/${context.workspaceId}/goals`,
      body: {
        title: text(args, "title"),
        ...(text(args, "description") ? { description: text(args, "description") } : {}),
        successCriteria: list(args, "successCriteria"),
        // §4.5 — a need that is really several becomes a tree, and the tree
        // is what says which piece served which. Without it a manager that
        // splits a need produces goals nobody can relate to each other.
        ...(text(args, "parentGoalId")
          ? { parentGoalId: text(args, "parentGoalId") }
          : {}),
      },
    }),
  },
  {
    name: "cut_task",
    step: "Organise (§4.6)",
    scope: "manage_tasks",
    description:
      "Cut one piece of work out of a goal and give it to somebody by name. A task is assigned from its first instant — decide who does it as you create it. Use list_team to see who exists.",
    parameters: {
      goalId: {
        type: "string",
        description: "The goal this serves — the id state_goal gave you back",
        required: true,
      },
      title: { type: "string", description: "What this piece is", required: true },
      description: {
        type: "string",
        description: "Everything the agent doing it will need, since it cannot ask you",
      },
      acceptanceCriteria: {
        type: "list",
        description: "What makes THIS piece done. At least one.",
        required: true,
      },
      assigneeId: {
        type: "string",
        description: "The actor id of the agent who will do it, from list_team",
        required: true,
      },
      assigneeType: {
        type: "string",
        description: 'Usually "AGENT". "HUMAN" when it genuinely needs a person.',
      },
    },
    request: (context, args) => ({
      method: "POST",
      path: `/workspaces/${context.workspaceId}/tasks`,
      body: {
        goalId: text(args, "goalId"),
        title: text(args, "title"),
        ...(text(args, "description") ? { description: text(args, "description") } : {}),
        acceptanceCriteria: list(args, "acceptanceCriteria"),
        assigneeType: text(args, "assigneeType") || "AGENT",
        assigneeId: text(args, "assigneeId"),
      },
    }),
  },
  {
    name: "hand_over",
    step: "Organise (§4.6)",
    scope: "manage_tasks",
    description:
      "Move an existing task to a different agent — because the first one is blocked, or because somebody else is better placed. The task keeps its history.",
    parameters: {
      taskId: { type: "string", description: "The task to move", required: true },
      assigneeId: { type: "string", description: "Who gets it now", required: true },
      assigneeType: { type: "string", description: 'Usually "AGENT"' },
    },
    request: (context, args) => ({
      method: "POST",
      path: `/workspaces/${context.workspaceId}/tasks/${text(args, "taskId")}/assign`,
      body: {
        assigneeType: text(args, "assigneeType") || "AGENT",
        assigneeId: text(args, "assigneeId"),
      },
    }),
  },
  {
    name: "list_team",
    step: "Organise (§4.6)",
    scope: "read_workspace_state",
    description:
      "Who is in this workspace, with their actor id and their role. Read this before assigning anything: you assign by id, and only an AGENT_CONTRIBUTOR can execute work.",
    parameters: {},
    request: (context) => ({
      method: "GET",
      path: `/workspaces/${context.workspaceId}/members`,
    }),
  },
  {
    name: "list_goals",
    step: "Organise (§4.5)",
    scope: "read_workspace_state",
    description:
      "The goals of this workspace and how far along they are. Read it before stating a new one — the need you were given may already be covered.",
    parameters: {},
    request: (context) => ({
      method: "GET",
      path: `/workspaces/${context.workspaceId}/goals`,
    }),
  },
];

/**
 * The names Claude Code uses in `--allowedTools`, which is `mcp__<server>__<tool>`.
 * Derived rather than written twice: a list that could disagree with the
 * tools it names would let a tool exist that nothing allows, or allow one
 * that does not exist.
 */
export function allowedToolNames(
  serverName: string,
  scopes?: readonly string[],
): string[] {
  return toolsFor(scopes).map((tool) => `mcp__${serverName}__${tool.name}`);
}

/**
 * The tools a grant actually pays for.
 *
 * Filtering here rather than letting the hub refuse at call time is not
 * belt-and-braces, it is a different behaviour: a model handed a tool it may
 * not use will try it, be refused, and spend its turn reasoning about a
 * permission error instead of doing the work. What it is never offered, it
 * never attempts.
 *
 * An absent scope list means "everything", which is what an older worker or a
 * test that does not care gets. That is deliberate — the hub refuses on its
 * own anyway, so the fallback is safe, merely less kind.
 */
export function toolsFor(scopes?: readonly string[]): readonly ProtocolTool[] {
  if (!scopes) {
    return PROTOCOL_TOOLS;
  }
  const held = new Set(scopes);
  return PROTOCOL_TOOLS.filter((tool) => held.has(tool.scope));
}
