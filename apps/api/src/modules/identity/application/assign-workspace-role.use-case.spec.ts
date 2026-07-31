import { WorkspaceRole } from "@repo/db";

import { AssignWorkspaceRoleUseCase } from "./assign-workspace-role.use-case";
import { InMemoryWorkspaceMembershipRepository } from "./testing/in-memory-workspace-membership.repository";

describe("AssignWorkspaceRoleUseCase", () => {
  it("creates a new membership when none exists", async () => {
    const memberships = new InMemoryWorkspaceMembershipRepository();
    const useCase = new AssignWorkspaceRoleUseCase(memberships);

    const membership = await useCase.execute({
      workspaceId: "workspace-1",
      actorType: "HUMAN",
      actorId: "user-1",
      role: WorkspaceRole.OWNER,
    });

    expect(membership.role).toBe(WorkspaceRole.OWNER);
    await expect(memberships.findByActor("workspace-1", "HUMAN", "user-1")).resolves.toBe(membership);
  });

  it("re-assigns the role when a membership already exists", async () => {
    const memberships = new InMemoryWorkspaceMembershipRepository();
    const useCase = new AssignWorkspaceRoleUseCase(memberships);
    await useCase.execute({
      workspaceId: "workspace-1",
      actorType: "AGENT",
      actorId: "agent-1",
      role: WorkspaceRole.AGENT_CONTRIBUTOR,
    });

    const updated = await useCase.execute({
      workspaceId: "workspace-1",
      actorType: "AGENT",
      actorId: "agent-1",
      role: WorkspaceRole.AGENT_MANAGER,
    });

    expect(updated.role).toBe(WorkspaceRole.AGENT_MANAGER);
    const all = await memberships.listByWorkspace("workspace-1");
    expect(all).toHaveLength(1);
  });
});
