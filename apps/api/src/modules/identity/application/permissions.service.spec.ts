import { WorkspaceRole } from "@repo/db";

import { WorkspaceMembership } from "../domain/workspace-membership";
import { PermissionsService } from "./permissions.service";
import { InMemoryWorkspaceMembershipRepository } from "./testing/in-memory-workspace-membership.repository";

describe("PermissionsService", () => {
  it("grants a permission held by the actor's role", async () => {
    const memberships = new InMemoryWorkspaceMembershipRepository();
    await memberships.save(
      WorkspaceMembership.create({
        workspaceId: "workspace-1",
        actorType: "HUMAN",
        actorId: "user-1",
        role: WorkspaceRole.HUMAN_OPERATOR,
      }),
    );
    const service = new PermissionsService(memberships);

    await expect(
      service.can("HUMAN", "user-1", "workspace-1", "validate_decision"),
    ).resolves.toBe(true);
  });

  it("denies a permission the actor's role does not have", async () => {
    const memberships = new InMemoryWorkspaceMembershipRepository();
    await memberships.save(
      WorkspaceMembership.create({
        workspaceId: "workspace-1",
        actorType: "AGENT",
        actorId: "agent-1",
        role: WorkspaceRole.READ_ONLY_AGENT,
      }),
    );
    const service = new PermissionsService(memberships);

    await expect(service.can("AGENT", "agent-1", "workspace-1", "start_process")).resolves.toBe(
      false,
    );
  });

  it("denies anything for an actor with no membership in the workspace", async () => {
    const memberships = new InMemoryWorkspaceMembershipRepository();
    const service = new PermissionsService(memberships);

    await expect(service.can("HUMAN", "stranger", "workspace-1", "read_tasks")).resolves.toBe(
      false,
    );
  });

  it("lists the ids of every workspace an actor can access", async () => {
    const memberships = new InMemoryWorkspaceMembershipRepository();
    await memberships.save(
      WorkspaceMembership.create({
        workspaceId: "workspace-1",
        actorType: "HUMAN",
        actorId: "user-1",
        role: WorkspaceRole.OWNER,
      }),
    );
    await memberships.save(
      WorkspaceMembership.create({
        workspaceId: "workspace-2",
        actorType: "HUMAN",
        actorId: "user-1",
        role: WorkspaceRole.VIEWER,
      }),
    );
    await memberships.save(
      WorkspaceMembership.create({
        workspaceId: "workspace-3",
        actorType: "HUMAN",
        actorId: "someone-else",
        role: WorkspaceRole.OWNER,
      }),
    );
    const service = new PermissionsService(memberships);

    const ids = await service.listAccessibleWorkspaceIds("HUMAN", "user-1");

    expect(ids.sort()).toEqual(["workspace-1", "workspace-2"]);
  });
});
