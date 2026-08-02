import { ActorType, WorkspaceRole } from "@repo/db";

import { InMemoryWorkspaceMembershipRepository } from "../../identity/application/testing/in-memory-workspace-membership.repository";
import { WorkspaceMembership } from "../../identity/domain/workspace-membership";
import { Agent } from "../domain/agent";
import { BackfillAgentPromptProfilesUseCase } from "./backfill-agent-prompt-profiles.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

describe("BackfillAgentPromptProfilesUseCase", () => {
  it("fills empty manager and contributor profiles without overwriting customized agents", async () => {
    const agents = new InMemoryAgentRepository();
    const memberships = new InMemoryWorkspaceMembershipRepository();
    const manager = Agent.create({
      workspaceId: "w1",
      provider: "codex",
      displayName: "Manager",
    });
    const contributor = Agent.create({
      workspaceId: "w1",
      provider: "codex",
      displayName: "Contributor",
    });
    const custom = Agent.create({
      workspaceId: "w1",
      provider: "claude",
      displayName: "Custom",
      promptProfile: { systemPrompt: "Keep me" },
    });
    for (const agent of [manager, contributor, custom])
      await agents.save(agent);
    await memberships.save(
      WorkspaceMembership.create({
        workspaceId: "w1",
        actorType: ActorType.AGENT,
        actorId: manager.id.toString(),
        role: WorkspaceRole.AGENT_MANAGER,
      }),
    );
    await memberships.save(
      WorkspaceMembership.create({
        workspaceId: "w1",
        actorType: ActorType.AGENT,
        actorId: contributor.id.toString(),
        role: WorkspaceRole.AGENT_CONTRIBUTOR,
      }),
    );
    await memberships.save(
      WorkspaceMembership.create({
        workspaceId: "w1",
        actorType: ActorType.AGENT,
        actorId: custom.id.toString(),
        role: WorkspaceRole.AGENT_MANAGER,
      }),
    );

    const updated = await new BackfillAgentPromptProfilesUseCase(
      agents,
      memberships,
    ).execute("w1");

    expect(updated).toHaveLength(2);
    expect(manager.promptProfile["role"]).toBe("manager");
    expect(contributor.promptProfile["role"]).toBe("contributor");
    expect(custom.promptProfile).toEqual({ systemPrompt: "Keep me" });
  });
});
