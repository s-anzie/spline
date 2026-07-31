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
    expect(prompt).toContain("Never start or stop a process without holding its resource lock");
    expect(prompt).toContain('"maxConcurrentAgents": 3');
  });
});
