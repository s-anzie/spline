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
    });

    expect(profile.capabilities).toEqual(["code_edit", "shell_exec"]);
    expect(profile.approvalRules).toEqual({ autoApprove: false });
    expect(profile.sandboxModel).toBe(SandboxModel.FULL_ACCESS);
  });
});
