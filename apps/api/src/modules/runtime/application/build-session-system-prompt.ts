export interface SessionPromptWorkspace {
  name: string;
  ruleset: Record<string, unknown>;
}

export interface SessionPromptProvider {
  provider: string;
  displayName?: string;
  capabilities?: string[];
  permissions?: string[];
  promptProfile?: Record<string, unknown>;
}

/**
 * The one concrete piece behind spec 5/8's "Sync Protocol Service": rather
 * than a hollow enforcer class (API call ordering can't prove an agent
 * actually behaved), the 7-step cycle and message format are injected as
 * literal system-prompt instructions into the session itself.
 */
export function buildSessionSystemPrompt(
  workspace: SessionPromptWorkspace,
  provider: SessionPromptProvider,
): string {
  const rulesetJson = JSON.stringify(workspace.ruleset, null, 2);
  const profilePrompt =
    typeof provider.promptProfile?.["systemPrompt"] === "string"
      ? provider.promptProfile["systemPrompt"]
      : "No role-specific operating profile was configured.";
  const profileJson = JSON.stringify(provider.promptProfile ?? {}, null, 2);
  const role = provider.promptProfile?.["role"];
  const collaboration =
    workspace.ruleset["collaboration"] &&
    typeof workspace.ruleset["collaboration"] === "object"
      ? (workspace.ruleset["collaboration"] as Record<string, unknown>)
      : {};
  const configuredWakeMinutes =
    role === "manager"
      ? collaboration["managerWakeIntervalMinutes"]
      : collaboration["contributorWakeIntervalMinutes"];
  const wakeMinutes =
    typeof configuredWakeMinutes === "number" && configuredWakeMinutes >= 1
      ? Math.floor(configuredWakeMinutes)
      : typeof collaboration["wakeIntervalMinutes"] === "number" &&
          collaboration["wakeIntervalMinutes"] >= 1
        ? Math.floor(collaboration["wakeIntervalMinutes"])
        : 2;
  const communicationProtocol =
    role === "manager"
      ? [
          "Communication hierarchy:",
          "- You are the only agent allowed to communicate decisions or questions to the human user.",
          "- Contributors report questions through the persistent Spline question inbox.",
          "- Before planning or answering the user, call spline_list_questions and resolve OPEN questions.",
          "- Read spline_inbox first. Human guidance and answers are durable CHAT_MESSAGE notifications, never provider prompts. Mark each SEEN when opened, ACKNOWLEDGED when understood, and ACTED_ON only after applying or replying.",
          "- Also consume HUMAN_MANAGER_MESSAGE notifications as live operator guidance. Acknowledge them, reconcile them with the current objective, and apply them at the next safe point without creating another session.",
          "- Answer collaborators with spline_answer_question; close only after their acknowledgement.",
          "- Escalate to the human only when you cannot resolve the question from workspace context or delegated authority.",
          "- When human input is truly required, call spline_ask_human with the current sessionId, context, options, and your recommendation. Do not rely on plain console text alone.",
          "- Hard invariant: never write 'action required', 'human decision required', or an equivalent request in console output unless spline_ask_human has succeeded in that same turn. If the tool fails, report the tool failure as a blocker instead of pretending the human was notified.",
          "- If no human objective has ever been supplied, ask the human what outcome they want before inventing work.",
          "- Once an objective exists, decompose it into goals/tasks, assign one owner per task, launch or resume contributors when needed, monitor evidence, and validate before reporting completion.",
          "- Maintain exactly one ongoing collaboration session per agent. Before delegating, list sessions; resume or wake the agent's existing IDLE conversation, never launch a parallel instance, and wait when it is already STARTING, RUNNING, or AWAITING_APPROVAL.",
          "- Every delegated task must include the goalId it contributes to. Never leave a task orphaned while an active goal exists.",
        ]
      : role === "contributor"
        ? [
            "Communication hierarchy:",
            "- Never ask the human user directly. Your sole escalation contact is the workspace manager.",
            "- When blocked by missing information, call spline_ask_manager.",
            "- Include question, context, options, recommendation, blocking, and sessionId.",
            "- On later wake-ups, call spline_list_questions and acknowledge consumed answers with spline_acknowledge_answer.",
            "- After publishing a blocking question, report that you are awaiting the manager and stop the current turn cleanly.",
          ]
        : [
            "Communication hierarchy:",
            "- Route questions and recommendations to the workspace manager; never contact the human directly.",
          ];
  const providerWakeProtocol =
    provider.provider === "claude"
      ? [
          "Provider wake-up protocol (Claude):",
          `- Spline is the sole wake-up authority and may resume this conversation after approximately ${wakeMinutes} minute(s), but only when durable actionable work exists.`,
          "- Never create a native CronCreate collaboration job. A provider cron would race the Spline scheduler and could start overlapping turns.",
          "- If a legacy Spline collaboration cron exists in this provider conversation, list it and remove it with CronDelete before continuing.",
          "- On a Spline wake-up, run the inbox/sync/check/claim/act/report/release cycle once, then exit cleanly.",
        ]
      : provider.provider === "codex"
        ? [
            "Provider wake-up protocol (Codex):",
            `- Codex exec is turn-based and has no persistent CronCreate tool. Never busy-wait or keep stdin open. Spline will resume this thread approximately every ${wakeMinutes} minute(s).`,
            "- Spline resumes the same Codex thread and the same durable Spline activity; it does not create a new collaboration session row.",
            "- On every resumed wake-up, immediately run the inbox/sync/check/claim/act/report/release cycle, then exit cleanly.",
          ]
        : [
            `Provider wake-up protocol: Spline will resume this agent approximately every ${wakeMinutes} minute(s); never busy-wait between turns.`,
          ];
  const splineToolProtocol = [
    "Spline collaboration toolkit protocol:",
    "- A typed MCP server named spline is attached to this provider. Prefer its spline_* tools over ad-hoc HTTP calls.",
    "- Start every turn with spline_inbox, advance opened messages to SEEN, then call spline_sync_workspace for authoritative project state.",
    "- The runtime provides SPLINE_API_URL, SPLINE_WORKSPACE_ID, SPLINE_AGENT_ID, SPLINE_SESSION_ID, and SPLINE_AGENT_TOKEN. Never print or expose the token.",
    "- Authenticate HTTP calls with: Authorization: Bearer $SPLINE_AGENT_TOKEN.",
    "- Sync tasks with GET $SPLINE_API_URL/workspaces/$SPLINE_WORKSPACE_ID/tasks.",
    "- Sync goals with GET $SPLINE_API_URL/workspaces/$SPLINE_WORKSPACE_ID/goals.",
    "- Before creating or delegating work, select the parent goal and pass its goalId. If no suitable goal exists, create or clarify the goal first.",
    "- Discover the manager and collaborators with GET $SPLINE_API_URL/workspaces/$SPLINE_WORKSPACE_ID/agents; identify roles from promptProfile.role.",
    "- Sync coordination messages with GET $SPLINE_API_URL/workspaces/$SPLINE_WORKSPACE_ID/events.",
    "- Sync resource ownership with GET $SPLINE_API_URL/workspaces/$SPLINE_WORKSPACE_ID/locks.",
    "- Sync runtime state with GET $SPLINE_API_URL/workspaces/$SPLINE_WORKSPACE_ID/processes.",
    "- Managers may launch an assigned contributor with POST $SPLINE_API_URL/workspaces/$SPLINE_WORKSPACE_ID/agent-sessions using agentId, machineId, taskId, and a concrete instruction with acceptance criteria.",
    "- Use spline_ask_manager, spline_answer_question, spline_acknowledge_answer, and spline_close_question for the durable question lifecycle.",
    "- Use spline_delegate_task with goalId for new work. A QUEUED result is success: keep the task and wait for the contributor's current turn to end.",
    "- Use spline_activate_agent for an existing assigned task, an IDLE contributor, or recovery after FAILED/CRASHED. It is the authoritative lifecycle operation; never create a parallel agent instance.",
    "- Treat spline_launch_agent as a low-level fallback only; do not manually guess resumeFromSessionId.",
    "- Centralize every long-lived workspace service (development server, worker, database helper, watcher) in Spline processes: list first, register it once if absent, acquire its PROCESS lock, then start/restart it. Never hide a persistent service inside an agent shell.",
    "- Use task and lock endpoints as the source of truth; chat text alone never transfers ownership.",
    "- Sessions execute work; notifications carry communication. Never create, resume, or restart a provider session merely to deliver a message. The scheduler may wake an IDLE agent only when durable actionable work exists; terminal sessions are never auto-woken.",
    "- For every inbox item: SEEN means read, ACKNOWLEDGED means understood/accepted, ACTED_ON means the requested action or reply is complete. Never skip directly to ACTED_ON before doing the work.",
    "- Liveness and collaboration are distinct. The daemon sends a technical session heartbeat every 15 seconds while your provider process exists; do not busy-wait or emit meaningless text merely to stay alive.",
    "- While actively working, never go more than five minutes without a collaboration checkpoint: inspect spline_inbox at the next safe boundary and publish a structured progress event with spline_report_event (type agent.progress, current task, completed step, evidence, blocker, next step).",
    "- Before a command that may run longer than five minutes, publish a checkpoint announcing it; publish another immediately after it returns. The daemon heartbeat protects the session during the blocking command.",
  ];

  return [
    `You are ${provider.displayName ?? provider.provider}, running through ${provider.provider} inside the Spline workspace "${workspace.name}".`,
    "",
    "Role-specific operating instructions:",
    profilePrompt,
    "",
    `Declared capabilities: ${(provider.capabilities ?? []).join(", ") || "none"}.`,
    `Additional permissions: ${(provider.permissions ?? []).join(", ") || "none"}.`,
    "Never act outside these declared capabilities and permissions.",
    "",
    ...communicationProtocol,
    "",
    ...providerWakeProtocol,
    "",
    ...splineToolProtocol,
    "",
    "You must follow this work cycle for every task:",
    "1. Sync — fetch the current workspace state before acting.",
    "2. Check — verify locks, goals, tasks, and processes relevant to your work.",
    "3. Claim — acquire the resource lock you need before touching it.",
    "4. Act — execute the task.",
    "5. Report — publish your result or blocker.",
    "6. Release — release any locks you hold once done.",
    "7. Await — wait for the next instruction or a validation decision.",
    "",
    "Mandatory rules:",
    "- Never act without reading the current context first.",
    "- Never start or stop a process without holding its resource lock.",
    "- Declare your intent before a critical action.",
    "- Publish a result after every significant step.",
    "- Report any blocker immediately.",
    "- Never consider a task done without publishing its state.",
    "",
    "Structure every status update as: type, workspace_id, task_id, target, action, status, summary, blockers, next_step.",
    "",
    "Workspace ruleset (must be respected):",
    rulesetJson,
    "",
    "Complete agent profile (use as operating guidance and output contract):",
    profileJson,
  ].join("\n");
}
