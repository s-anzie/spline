import { buildSessionSystemPrompt } from "./build-session-system-prompt";

describe("buildSessionSystemPrompt", () => {
  it("embeds the provider, workspace name, the 7-step cycle, and the ruleset", () => {
    const prompt = buildSessionSystemPrompt(
      { name: "My Project", ruleset: { maxConcurrentAgents: 3 } },
      { provider: "claude" },
    );

    expect(prompt).toContain("claude");
    expect(prompt).toContain("My Project");
    expect(prompt).toContain("1. Sync");
    expect(prompt).toContain("7. Await");
    expect(prompt).toContain(
      "Never start or stop a process without holding its resource lock",
    );
    expect(prompt).toContain('"maxConcurrentAgents": 3');
  });

  it("injects the agent identity, declared scope, and role-specific profile", () => {
    const prompt = buildSessionSystemPrompt(
      { name: "Project", ruleset: {} },
      {
        provider: "codex",
        displayName: "Backend Worker",
        capabilities: ["code_edit"],
        permissions: ["read_files"],
        promptProfile: {
          role: "contributor",
          systemPrompt: "Inspect before editing.",
        },
      },
    );
    expect(prompt).toContain("Backend Worker");
    expect(prompt).toContain("Inspect before editing.");
    expect(prompt).toContain("Declared capabilities: code_edit");
    expect(prompt).toContain("Additional permissions: read_files");
    expect(prompt).toContain('"role": "contributor"');
    expect(prompt).toContain("Never ask the human user directly");
    expect(prompt).toContain("spline_ask_manager");
    expect(prompt).toContain("Codex exec is turn-based");
    expect(prompt).toContain("every 2 minute(s)");
  });

  it("instructs a Claude manager to configure native cron and own human communication", () => {
    const prompt = buildSessionSystemPrompt(
      {
        name: "Project",
        ruleset: {
          collaboration: { managerWakeIntervalMinutes: 5 },
        },
      },
      {
        provider: "claude",
        promptProfile: { role: "manager" },
      },
    );
    expect(prompt).toContain("only agent allowed to communicate");
    expect(prompt).toContain("CronCreate job every 5 minute(s)");
    expect(prompt).toContain("list existing jobs first");
    expect(prompt).toContain("spline_answer_question");
  });
});
