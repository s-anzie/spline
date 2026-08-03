import { createInterface } from "node:readline";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Tool = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, Json>; required?: string[] };
  method: "GET" | "POST" | "PATCH";
  path: (input: Record<string, Json>) => string;
  body?: (input: Record<string, Json>) => Json;
};

const apiUrl = process.env["SPLINE_API_URL"]?.replace(/\/$/, "");
const workspaceId = process.env["SPLINE_WORKSPACE_ID"];
const token = process.env["SPLINE_AGENT_TOKEN"];
const agentRole = process.env["SPLINE_AGENT_ROLE"] ?? "unknown";
if (!apiUrl || !workspaceId || !token) {
  process.stderr.write("Spline MCP requires SPLINE_API_URL, SPLINE_WORKSPACE_ID and SPLINE_AGENT_TOKEN\n");
  process.exit(1);
}

const workspace = (path: string) => `/workspaces/${workspaceId}${path}`;
const stringProperty = (description: string) => ({ type: "string", description });
const without = (input: Record<string, Json>, key: string): Json => {
  const body = { ...input };
  delete body[key];
  return body;
};

const tools: Tool[] = [
  { name: "spline_sync_workspace", description: "Read goals, tasks, agents, events, locks, processes, and open manager questions in one call.", inputSchema: { type: "object", properties: {} }, method: "GET", path: () => workspace("/collaboration/sync") },
  { name: "spline_list_tasks", description: "List workspace tasks and their current ownership/state.", inputSchema: { type: "object", properties: {} }, method: "GET", path: () => workspace("/tasks") },
  { name: "spline_get_task", description: "Read one task including status, assignee, dependencies, blockers, and validation state.", inputSchema: { type: "object", properties: { taskId: stringProperty("Task UUID") }, required: ["taskId"] }, method: "GET", path: (i) => workspace(`/tasks/${i.taskId}`) },
  { name: "spline_update_task", description: "Update task title, description, priority, or dependencies without changing lifecycle state.", inputSchema: { type: "object", properties: { taskId: stringProperty("Task UUID"), title: stringProperty("Optional title"), description: stringProperty("Optional scope and acceptance criteria"), priority: stringProperty("Optional LOW, MEDIUM, HIGH, or CRITICAL"), dependencies: { type: "array", items: { type: "string" } } }, required: ["taskId"] }, method: "PATCH", path: (i) => workspace(`/tasks/${i.taskId}`), body: (i) => without(i, "taskId") },
  { name: "spline_list_goals", description: "List workspace goals, progress, dependencies, blockers, and validation state.", inputSchema: { type: "object", properties: {} }, method: "GET", path: () => workspace("/goals") },
  { name: "spline_get_goal", description: "Read one goal and its complete current state.", inputSchema: { type: "object", properties: { goalId: stringProperty("Goal UUID") }, required: ["goalId"] }, method: "GET", path: (i) => workspace(`/goals/${i.goalId}`) },
  { name: "spline_create_goal", description: "Create a workspace goal with measurable success criteria.", inputSchema: { type: "object", properties: { title: stringProperty("Goal title"), description: stringProperty("Desired outcome"), priority: stringProperty("LOW, MEDIUM, HIGH, or CRITICAL"), successCriteria: { type: "array", items: {} } }, required: ["title"] }, method: "POST", path: () => workspace("/goals"), body: (i) => i },
  { name: "spline_update_goal", description: "Update goal details, success criteria, dates, or dependencies without changing lifecycle state.", inputSchema: { type: "object", properties: { goalId: stringProperty("Goal UUID"), title: stringProperty("Optional title"), description: stringProperty("Optional desired outcome"), priority: stringProperty("Optional LOW, MEDIUM, HIGH, or CRITICAL"), successCriteria: { type: "array", items: {} }, startDate: stringProperty("Optional ISO date"), dueDate: stringProperty("Optional ISO date"), dependencies: { type: "array", items: { type: "string" } } }, required: ["goalId"] }, method: "PATCH", path: (i) => workspace(`/goals/${i.goalId}`), body: (i) => without(i, "goalId") },
  { name: "spline_update_goal_status", description: "Advance a goal through its validated lifecycle.", inputSchema: { type: "object", properties: { goalId: stringProperty("Goal UUID"), status: stringProperty("PLANNED, ACTIVE, BLOCKED, AT_RISK, REVIEW, COMPLETED, or CANCELLED") }, required: ["goalId", "status"] }, method: "POST", path: (i) => workspace(`/goals/${i.goalId}/status`), body: (i) => ({ status: i.status ?? null }) },
  { name: "spline_report_goal_blocker", description: "Attach a concrete blocker to a goal.", inputSchema: { type: "object", properties: { goalId: stringProperty("Goal UUID"), reason: stringProperty("Blocker reason and evidence") }, required: ["goalId", "reason"] }, method: "POST", path: (i) => workspace(`/goals/${i.goalId}/blockers`), body: (i) => ({ reason: i.reason ?? null }) },
  { name: "spline_validate_goal", description: "Manager-only: validate a goal after checking success criteria and evidence.", inputSchema: { type: "object", properties: { goalId: stringProperty("Goal UUID") }, required: ["goalId"] }, method: "POST", path: (i) => workspace(`/goals/${i.goalId}/validate`) },
  { name: "spline_reject_goal", description: "Manager-only: reject goal validation for corrective work.", inputSchema: { type: "object", properties: { goalId: stringProperty("Goal UUID") }, required: ["goalId"] }, method: "POST", path: (i) => workspace(`/goals/${i.goalId}/reject`) },
  { name: "spline_create_task", description: "Create a scoped task attached to the goal it contributes to.", inputSchema: { type: "object", properties: { goalId: stringProperty("Goal UUID this task contributes to"), title: stringProperty("Task title"), description: stringProperty("Scope and acceptance criteria"), priority: stringProperty("LOW, MEDIUM, HIGH, or CRITICAL") }, required: ["goalId", "title"] }, method: "POST", path: () => workspace("/tasks"), body: (i) => ({ goalId: i.goalId ?? null, title: i.title ?? null, description: i.description ?? null, priority: i.priority ?? "MEDIUM" }) },
  { name: "spline_link_task_to_goal", description: "Repair or change the goal a task contributes to; progression is recalculated automatically.", inputSchema: { type: "object", properties: { taskId: stringProperty("Task UUID"), goalId: stringProperty("Goal UUID") }, required: ["taskId", "goalId"] }, method: "POST", path: (i) => workspace(`/tasks/${i.taskId}/link-goal`), body: (i) => ({ goalId: i.goalId ?? null }) },
  { name: "spline_assign_task", description: "Assign a task to one accountable agent.", inputSchema: { type: "object", properties: { taskId: stringProperty("Task UUID"), agentId: stringProperty("Agent UUID") }, required: ["taskId", "agentId"] }, method: "POST", path: (i) => workspace(`/tasks/${i.taskId}/assign`), body: (i) => ({ assigneeType: "AGENT", assigneeId: i.agentId ?? null }) },
  { name: "spline_update_task_status", description: "Update a task lifecycle status with backend validation.", inputSchema: { type: "object", properties: { taskId: stringProperty("Task UUID"), status: stringProperty("BACKLOG, TODO, IN_PROGRESS, BLOCKED, IN_REVIEW, DONE, or CANCELLED") }, required: ["taskId", "status"] }, method: "POST", path: (i) => workspace(`/tasks/${i.taskId}/status`), body: (i) => ({ status: i.status ?? null }) },
  { name: "spline_report_task_blocker", description: "Attach a concrete blocker to a task.", inputSchema: { type: "object", properties: { taskId: stringProperty("Task UUID"), reason: stringProperty("Evidence-based blocker reason") }, required: ["taskId", "reason"] }, method: "POST", path: (i) => workspace(`/tasks/${i.taskId}/blockers`), body: (i) => ({ reason: i.reason ?? null }) },
  { name: "spline_validate_task", description: "Manager-only: validate a task in review after checking evidence.", inputSchema: { type: "object", properties: { taskId: stringProperty("Task UUID") }, required: ["taskId"] }, method: "POST", path: (i) => workspace(`/tasks/${i.taskId}/validate`) },
  { name: "spline_reject_task", description: "Manager-only: reject task validation and return it for correction.", inputSchema: { type: "object", properties: { taskId: stringProperty("Task UUID") }, required: ["taskId"] }, method: "POST", path: (i) => workspace(`/tasks/${i.taskId}/reject`) },
  { name: "spline_acquire_lock", description: "Acquire a resource lock before mutation.", inputSchema: { type: "object", properties: { resourceType: stringProperty("Resource type enum"), resourceId: stringProperty("Resource identifier"), reason: stringProperty("Why the lock is needed") }, required: ["resourceType", "resourceId"] }, method: "POST", path: () => workspace("/locks"), body: (i) => i },
  { name: "spline_release_lock", description: "Release a held resource lock after work or handoff.", inputSchema: { type: "object", properties: { lockId: stringProperty("Lock UUID") }, required: ["lockId"] }, method: "POST", path: (i) => workspace(`/locks/${i.lockId}/release`) },
  { name: "spline_ask_manager", description: "Contributor-only: send a structured blocking or non-blocking question to the manager.", inputSchema: { type: "object", properties: { question: stringProperty("Precise question"), context: stringProperty("Evidence and attempted resolution"), options: { type: "array", items: { type: "string" } }, recommendation: stringProperty("Recommended answer and rationale"), blocking: { type: "boolean" }, sessionId: stringProperty("Current Spline session UUID") }, required: ["question", "context", "blocking"] }, method: "POST", path: () => workspace("/agent-questions"), body: (i) => i },
  { name: "spline_list_questions", description: "Manager: list contributor questions by lifecycle status.", inputSchema: { type: "object", properties: { status: stringProperty("Optional OPEN, ANSWERED, ACKNOWLEDGED, or CLOSED") } }, method: "GET", path: (i) => workspace(`/agent-questions${i.status ? `?status=${encodeURIComponent(String(i.status))}` : ""}`) },
  { name: "spline_answer_question", description: "Manager-only: answer a contributor question with a concrete decision.", inputSchema: { type: "object", properties: { questionId: stringProperty("Question UUID"), answer: stringProperty("Decision or actionable answer") }, required: ["questionId", "answer"] }, method: "POST", path: (i) => workspace(`/agent-questions/${i.questionId}/answer`), body: (i) => ({ answer: i.answer ?? null }) },
  { name: "spline_acknowledge_answer", description: "Contributor: acknowledge that a manager answer was consumed.", inputSchema: { type: "object", properties: { questionId: stringProperty("Question UUID") }, required: ["questionId"] }, method: "POST", path: (i) => workspace(`/agent-questions/${i.questionId}/acknowledge`) },
  { name: "spline_close_question", description: "Manager-only: close a question after the contributor acknowledged the answer.", inputSchema: { type: "object", properties: { questionId: stringProperty("Question UUID") }, required: ["questionId"] }, method: "POST", path: (i) => workspace(`/agent-questions/${i.questionId}/close`) },
  { name: "spline_ask_human", description: "Manager-only: create a durable human attention request linked to the current session. Use only when the decision cannot be resolved autonomously.", inputSchema: { type: "object", properties: { question: stringProperty("Precise decision needed from the human"), context: stringProperty("Evidence, impact, and work already attempted"), options: { type: "array", items: { type: "string" } }, recommendation: stringProperty("Recommended option and rationale"), sessionId: stringProperty("Current manager session UUID") }, required: ["question", "context", "sessionId"] }, method: "POST", path: () => workspace("/collaboration/ask-human"), body: (i) => i },
  { name: "spline_launch_agent", description: "Manager-only: launch a contributor for an assigned task with explicit acceptance criteria. Spline automatically reuses the latest compatible provider conversation when possible.", inputSchema: { type: "object", properties: { agentId: stringProperty("Contributor UUID"), machineId: stringProperty("Online linked machine UUID"), taskId: stringProperty("Assigned task UUID"), instruction: stringProperty("Outcome, scope, constraints, acceptance criteria, validation") }, required: ["agentId", "machineId", "taskId", "instruction"] }, method: "POST", path: () => workspace("/agent-sessions"), body: (i) => i },
  { name: "spline_delegate_task", description: "Manager-only: coherently create, attach, assign, and launch a contributor task; automatically reuses its compatible provider conversation and compensates task creation if launch fails.", inputSchema: { type: "object", properties: { goalId: stringProperty("Goal UUID this task contributes to"), title: stringProperty("Task title"), description: stringProperty("Scope and acceptance criteria"), priority: stringProperty("LOW, MEDIUM, HIGH, or CRITICAL"), agentId: stringProperty("Contributor UUID"), machineId: stringProperty("Online linked machine UUID"), instruction: stringProperty("Outcome, constraints, acceptance criteria, and validation") }, required: ["goalId", "title", "description", "agentId", "machineId", "instruction"] }, method: "POST", path: () => workspace("/collaboration/delegate"), body: (i) => i },
  { name: "spline_record_decision", description: "Record a material workspace decision and its rationale.", inputSchema: { type: "object", properties: { subject: stringProperty("Decision subject"), context: stringProperty("Context"), decision: stringProperty("Chosen decision"), optionsConsidered: { type: "array", items: { type: "string" } }, references: { type: "array", items: { type: "string" } } }, required: ["subject", "decision"] }, method: "POST", path: () => workspace("/decisions"), body: (i) => i },
  { name: "spline_create_artifact", description: "Register a material output and link it to a goal/task/decision/process.", inputSchema: { type: "object", properties: { type: stringProperty("Artifact type enum"), name: stringProperty("Artifact name"), description: stringProperty("What it contains"), goalId: stringProperty("Optional goal UUID"), taskId: stringProperty("Optional task UUID"), decisionId: stringProperty("Optional decision UUID"), processId: stringProperty("Optional process UUID"), source: stringProperty("Source"), contentRef: stringProperty("Content reference"), checksum: stringProperty("Checksum") }, required: ["type", "name"] }, method: "POST", path: () => workspace("/artifacts"), body: (i) => i },
  { name: "spline_list_artifacts", description: "List registered workspace outputs and their links.", inputSchema: { type: "object", properties: {} }, method: "GET", path: () => workspace("/artifacts") },
  { name: "spline_get_artifact", description: "Read artifact metadata, versions, and links.", inputSchema: { type: "object", properties: { artifactId: stringProperty("Artifact UUID") }, required: ["artifactId"] }, method: "GET", path: (i) => workspace(`/artifacts/${i.artifactId}`) },
  { name: "spline_update_artifact", description: "Update mutable artifact metadata.", inputSchema: { type: "object", properties: { artifactId: stringProperty("Artifact UUID"), name: stringProperty("Optional name"), description: stringProperty("Optional description"), source: stringProperty("Optional source") }, required: ["artifactId"] }, method: "PATCH", path: (i) => workspace(`/artifacts/${i.artifactId}`), body: (i) => without(i, "artifactId") },
  { name: "spline_add_artifact_version", description: "Append a new immutable version reference to an artifact.", inputSchema: { type: "object", properties: { artifactId: stringProperty("Artifact UUID"), contentRef: stringProperty("Content reference"), checksum: stringProperty("Checksum") }, required: ["artifactId"] }, method: "POST", path: (i) => workspace(`/artifacts/${i.artifactId}/versions`), body: (i) => ({ contentRef: i.contentRef ?? null, checksum: i.checksum ?? null }) },
  { name: "spline_link_artifact", description: "Link an artifact to a goal, task, decision, or process.", inputSchema: { type: "object", properties: { artifactId: stringProperty("Artifact UUID"), targetType: stringProperty("GOAL, TASK, DECISION, or PROCESS"), targetId: stringProperty("Target UUID") }, required: ["artifactId", "targetType", "targetId"] }, method: "POST", path: (i) => workspace(`/artifacts/${i.artifactId}/link`), body: (i) => ({ targetType: i.targetType ?? null, targetId: i.targetId ?? null }) },
  { name: "spline_unlink_artifact", description: "Remove one typed link from an artifact.", inputSchema: { type: "object", properties: { artifactId: stringProperty("Artifact UUID"), targetType: stringProperty("GOAL, TASK, DECISION, or PROCESS") }, required: ["artifactId", "targetType"] }, method: "POST", path: (i) => workspace(`/artifacts/${i.artifactId}/unlink`), body: (i) => ({ targetType: i.targetType ?? null }) },
  { name: "spline_archive_artifact", description: "Archive an artifact that should remain auditable but no longer active.", inputSchema: { type: "object", properties: { artifactId: stringProperty("Artifact UUID") }, required: ["artifactId"] }, method: "POST", path: (i) => workspace(`/artifacts/${i.artifactId}/archive`) },
  { name: "spline_register_process", description: "Register a workspace process before controlling it.", inputSchema: { type: "object", properties: { name: stringProperty("Process name"), command: stringProperty("Executable command"), cwd: stringProperty("Workspace-relative or bounded cwd"), env: { type: "object" }, ownerAgentId: stringProperty("Optional owner agent UUID"), ports: { type: "array", items: { type: "number" } }, restartPolicy: stringProperty("NEVER, ON_FAILURE, or ALWAYS") }, required: ["name", "command", "cwd"] }, method: "POST", path: () => workspace("/processes"), body: (i) => i },
  { name: "spline_list_processes", description: "List registered processes and their runtime state.", inputSchema: { type: "object", properties: {} }, method: "GET", path: () => workspace("/processes") },
  { name: "spline_get_process", description: "Read one process configuration and runtime state.", inputSchema: { type: "object", properties: { processId: stringProperty("Process UUID") }, required: ["processId"] }, method: "GET", path: (i) => workspace(`/processes/${i.processId}`) },
  { name: "spline_start_process", description: "Start a registered process on a linked machine; acquire its lock first.", inputSchema: { type: "object", properties: { processId: stringProperty("Process UUID"), machineId: stringProperty("Machine UUID") }, required: ["processId", "machineId"] }, method: "POST", path: (i) => workspace(`/processes/${i.processId}/start`), body: (i) => ({ machineId: i.machineId ?? null }) },
  { name: "spline_stop_process", description: "Stop a process while holding its resource lock.", inputSchema: { type: "object", properties: { processId: stringProperty("Process UUID") }, required: ["processId"] }, method: "POST", path: (i) => workspace(`/processes/${i.processId}/stop`) },
  { name: "spline_restart_process", description: "Restart a process while holding its resource lock.", inputSchema: { type: "object", properties: { processId: stringProperty("Process UUID"), machineId: stringProperty("Machine UUID") }, required: ["processId", "machineId"] }, method: "POST", path: (i) => workspace(`/processes/${i.processId}/restart`), body: (i) => ({ machineId: i.machineId ?? null }) },
  { name: "spline_send_notification", description: "Send a scoped internal notification to explicit human or agent recipients.", inputSchema: { type: "object", properties: { kind: stringProperty("NotificationKind enum"), scope: stringProperty("NotificationScope enum"), taskId: stringProperty("Optional task UUID"), title: stringProperty("Title"), body: stringProperty("Body"), payload: { type: "object" }, recipients: { type: "array", items: { type: "object" } } }, required: ["kind", "scope", "body"] }, method: "POST", path: () => workspace("/notifications"), body: (i) => i },
  { name: "spline_list_notifications", description: "List workspace notifications for coordination and pending attention.", inputSchema: { type: "object", properties: {} }, method: "GET", path: () => workspace("/notifications") },
  { name: "spline_advance_notification", description: "Advance the authenticated agent recipient state for a notification.", inputSchema: { type: "object", properties: { notificationId: stringProperty("Notification UUID"), status: stringProperty("DELIVERED, SEEN, ACKNOWLEDGED, or ACTED_ON") }, required: ["notificationId", "status"] }, method: "POST", path: (i) => workspace(`/notifications/${i.notificationId}/advance`), body: (i) => ({ status: i.status ?? null }) },
  { name: "spline_report_event", description: "Publish a structured lifecycle, progress, blocker, handoff, or result event.", inputSchema: { type: "object", properties: { type: stringProperty("Event type"), severity: stringProperty("INFO, WARNING, ERROR, or CRITICAL"), payload: { type: "object" }, target: { type: "object" } }, required: ["type"] }, method: "POST", path: () => workspace("/events"), body: (i) => i },
  { name: "spline_list_events", description: "List the workspace event journal.", inputSchema: { type: "object", properties: {} }, method: "GET", path: () => workspace("/events") },
  { name: "spline_get_event", description: "Read one event and its structured payload.", inputSchema: { type: "object", properties: { eventId: stringProperty("Event UUID") }, required: ["eventId"] }, method: "GET", path: (i) => workspace(`/events/${i.eventId}`) },
  { name: "spline_acknowledge_event", description: "Record this agent's delivery, read, acknowledgement, or processing receipt for an event.", inputSchema: { type: "object", properties: { eventId: stringProperty("Event UUID"), status: stringProperty("Receipt status accepted by the workspace protocol") }, required: ["eventId", "status"] }, method: "POST", path: (i) => workspace(`/events/${i.eventId}/receipts`), body: (i) => ({ status: i.status ?? null }) },
  { name: "spline_list_decisions", description: "List material workspace decisions and rationale.", inputSchema: { type: "object", properties: {} }, method: "GET", path: () => workspace("/decisions") },
  { name: "spline_get_decision", description: "Read one material decision in full.", inputSchema: { type: "object", properties: { decisionId: stringProperty("Decision UUID") }, required: ["decisionId"] }, method: "GET", path: (i) => workspace(`/decisions/${i.decisionId}`) },
  { name: "spline_list_sessions", description: "List workspace agent sessions and lifecycle state.", inputSchema: { type: "object", properties: {} }, method: "GET", path: () => workspace("/agent-sessions") },
  { name: "spline_get_session", description: "Read one agent session and provider resumption metadata.", inputSchema: { type: "object", properties: { sessionId: stringProperty("Session UUID") }, required: ["sessionId"] }, method: "GET", path: (i) => workspace(`/agent-sessions/${i.sessionId}`) },
  { name: "spline_get_session_outputs", description: "Read persisted stdout and stderr for an agent session.", inputSchema: { type: "object", properties: { sessionId: stringProperty("Session UUID") }, required: ["sessionId"] }, method: "GET", path: (i) => workspace(`/agent-sessions/${i.sessionId}/outputs`) },
  { name: "spline_stop_session", description: "Manager-only: stop an active agent session cleanly.", inputSchema: { type: "object", properties: { sessionId: stringProperty("Session UUID") }, required: ["sessionId"] }, method: "POST", path: (i) => workspace(`/agent-sessions/${i.sessionId}/stop`) },
];

const managerOnlyTools = new Set([
  "spline_answer_question",
  "spline_ask_human",
  "spline_close_question",
  "spline_launch_agent",
  "spline_delegate_task",
  "spline_validate_task",
  "spline_reject_task",
  "spline_validate_goal",
  "spline_reject_goal",
  "spline_record_decision",
  "spline_stop_session",
]);
const contributorOnlyTools = new Set([
  "spline_ask_manager",
  "spline_acknowledge_answer",
]);
const availableTools = tools.filter((tool) => {
  if (agentRole === "manager") return !contributorOnlyTools.has(tool.name);
  if (agentRole === "contributor") return !managerOnlyTools.has(tool.name);
  return !managerOnlyTools.has(tool.name) && !contributorOnlyTools.has(tool.name);
});

async function execute(tool: Tool, input: Record<string, Json>): Promise<Json> {
  const response = await fetch(`${apiUrl}${tool.path(input)}`, {
    method: tool.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(tool.method === "GET" ? {} : { body: JSON.stringify(tool.body?.(input) ?? input) }),
  });
  const text = await response.text();
  let data: Json = text;
  try { data = text ? (JSON.parse(text) as Json) : null; } catch { /* keep text */ }
  if (!response.ok) throw new Error(`Spline API ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

function send(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

createInterface({ input: process.stdin }).on("line", (line) => {
  let responseId: string | number | undefined;
  void (async () => {
    let request: { id?: string | number; method?: string; params?: Record<string, unknown> };
    try { request = JSON.parse(line) as typeof request; } catch { return; }
    responseId = request.id;
    if (request.method === "notifications/initialized") return;
    if (request.method === "initialize") {
      send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "spline", version: "1.0.0" } } });
      return;
    }
    if (request.method === "tools/list") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: availableTools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      });
      return;
    }
    if (request.method === "tools/call") {
      const params = request.params as { name?: string; arguments?: Record<string, Json> };
      const tool = availableTools.find((candidate) => candidate.name === params.name);
      if (!tool) throw new Error(`Unknown Spline tool: ${params.name}`);
      const result = await execute(tool, params.arguments ?? {});
      send({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result } });
      return;
    }
    send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
  })().catch((error) =>
    send({
      jsonrpc: "2.0",
      id: responseId,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    }),
  );
});
