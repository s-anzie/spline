import { WorkspaceRole } from "@repo/db";

import { WorkspaceMembership } from "../../identity/domain/workspace-membership";
import { PermissionsService } from "../../identity/application/permissions.service";
import { InMemoryWorkspaceMembershipRepository } from "../../identity/application/testing/in-memory-workspace-membership.repository";
import { Workspace } from "../domain/workspace";
import { ListWorkspacesUseCase } from "./list-workspaces.use-case";
import { InMemoryWorkspaceRepository } from "./testing/in-memory-workspace.repository";

describe("ListWorkspacesUseCase", () => {
  function setup() {
    const workspaces = new InMemoryWorkspaceRepository();
    const memberships = new InMemoryWorkspaceMembershipRepository();
    const permissionsService = new PermissionsService(memberships);
    const useCase = new ListWorkspacesUseCase(workspaces, permissionsService);
    return { workspaces, memberships, useCase };
  }

  it("returns an empty list when the actor belongs to no workspace", async () => {
    const { useCase } = setup();

    await expect(useCase.execute("HUMAN", "user-1")).resolves.toEqual([]);
  });

  it("returns only the workspaces the actor is a member of", async () => {
    const { workspaces, memberships, useCase } = setup();
    const mine = Workspace.create({ name: "Mine" });
    const notMine = Workspace.create({ name: "Not mine" });
    await workspaces.save(mine);
    await workspaces.save(notMine);
    await memberships.save(
      WorkspaceMembership.create({
        workspaceId: mine.id.toString(),
        actorType: "HUMAN",
        actorId: "user-1",
        role: WorkspaceRole.OWNER,
      }),
    );

    const result = await useCase.execute("HUMAN", "user-1");

    expect(result.map((w) => w.name)).toEqual(["Mine"]);
  });
});
