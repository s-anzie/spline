import {
  withDefaultWorkspaceRuleset,
  workspaceRulesetNeedsBackfill,
} from "./default-workspace-ruleset";

describe("default workspace ruleset", () => {
  it("provides a complete general policy", () => {
    const ruleset = withDefaultWorkspaceRuleset();
    expect(ruleset).toHaveProperty("governance.humanAuthority", "final");
    expect(ruleset).toHaveProperty(
      "execution.requireResourceLockBeforeMutation",
      true,
    );
    expect(ruleset).toHaveProperty("security.neverExposeSecrets", true);
    expect(ruleset).toHaveProperty("quality.completionRequiresEvidence", true);
  });

  it("deeply preserves custom values and keys while filling missing defaults", () => {
    const ruleset = withDefaultWorkspaceRuleset({
      execution: { syncBeforeActing: false, customMode: "legacy" },
      customSection: { enabled: true },
    });
    expect(ruleset).toHaveProperty("execution.syncBeforeActing", false);
    expect(ruleset).toHaveProperty("execution.customMode", "legacy");
    expect(ruleset).toHaveProperty(
      "execution.requireResourceLockBeforeMutation",
      true,
    );
    expect(ruleset).toHaveProperty("customSection.enabled", true);
  });

  it("detects old partial rulesets but not completed ones", () => {
    expect(workspaceRulesetNeedsBackfill({})).toBe(true);
    expect(workspaceRulesetNeedsBackfill(withDefaultWorkspaceRuleset())).toBe(
      false,
    );
  });
});
