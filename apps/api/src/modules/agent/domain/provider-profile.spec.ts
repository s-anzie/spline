import { SandboxModel } from "@repo/db";

import { ProviderProfile } from "./provider-profile";
import { EmptyProviderNameError } from "./provider-profile.errors";

describe("ProviderProfile", () => {
  it("creates a profile with sensible defaults", () => {
    const profile = ProviderProfile.create({ provider: "claude" });

    expect(profile.provider).toBe("claude");
    expect(profile.capabilities).toEqual([]);
    expect(profile.promptFormat).toEqual({});
    expect(profile.approvalRules).toEqual({});
    expect(profile.hookSupport).toEqual([]);
    expect(profile.sandboxModel).toBe(SandboxModel.WORKSPACE_WRITE);
    expect(profile.outputSchema).toEqual({});
    expect(profile.available).toBe(true);
  });

  it("rejects an empty provider name", () => {
    expect(() => ProviderProfile.create({ provider: "   " })).toThrow(EmptyProviderNameError);
  });

  it("updates its config", () => {
    const profile = ProviderProfile.create({ provider: "codex" });

    profile.updateConfig({
      capabilities: ["code_edit", "shell_exec"],
      approvalRules: { autoApprove: false },
      sandboxModel: SandboxModel.FULL_ACCESS,
      available: false,
    });

    expect(profile.capabilities).toEqual(["code_edit", "shell_exec"]);
    expect(profile.approvalRules).toEqual({ autoApprove: false });
    expect(profile.sandboxModel).toBe(SandboxModel.FULL_ACCESS);
    expect(profile.available).toBe(false);
  });

  it("keeps manual availability separate from a temporary quota window", () => {
    const profile = ProviderProfile.create({ provider: "claude" });
    profile.updateConfig({
      quotaUnavailableUntil: new Date(Date.now() + 60_000),
      quotaReason: "usage limit",
    });

    expect(profile.manuallyAvailable).toBe(true);
    expect(profile.available).toBe(false);
    expect(profile.quotaReason).toBe("usage limit");

    profile.updateConfig({ available: false, quotaUnavailableUntil: new Date(0) });
    expect(profile.available).toBe(false);
    expect(profile.manuallyAvailable).toBe(false);
  });
});
