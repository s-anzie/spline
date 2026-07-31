import { WorkspaceRole } from "@repo/db";

import { WorkspaceMembership } from "./workspace-membership";

describe("WorkspaceMembership", () => {
  it("creates a membership binding an actor to a role within a workspace", () => {
    const membership = WorkspaceMembership.create({
      workspaceId: "workspace-1",
      actorType: "HUMAN",
      actorId: "user-1",
      role: WorkspaceRole.OWNER,
    });

    expect(membership.workspaceId).toBe("workspace-1");
    expect(membership.actorType).toBe("HUMAN");
    expect(membership.actorId).toBe("user-1");
    expect(membership.role).toBe(WorkspaceRole.OWNER);
  });

  it("allows re-assigning a different role", () => {
    const membership = WorkspaceMembership.create({
      workspaceId: "workspace-1",
      actorType: "AGENT",
      actorId: "agent-1",
      role: WorkspaceRole.AGENT_CONTRIBUTOR,
    });

    membership.changeRole(WorkspaceRole.AGENT_MANAGER);

    expect(membership.role).toBe(WorkspaceRole.AGENT_MANAGER);
  });
});
