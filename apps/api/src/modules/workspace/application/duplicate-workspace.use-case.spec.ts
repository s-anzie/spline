import { WorkspaceRole } from "@repo/db";

import { AssignWorkspaceRoleUseCase } from "../../identity/application/assign-workspace-role.use-case";
import { InMemoryWorkspaceMembershipRepository } from "../../identity/application/testing/in-memory-workspace-membership.repository";
import { Workspace } from "../domain/workspace";
import { WorkspaceNotFoundError } from "./workspace-application.errors";
import { DuplicateWorkspaceUseCase } from "./duplicate-workspace.use-case";
import { InMemoryWorkspaceRepository } from "./testing/in-memory-workspace.repository";

describe("DuplicateWorkspaceUseCase", () => {
  function setup() {
    const workspaces = new InMemoryWorkspaceRepository();
    const memberships = new InMemoryWorkspaceMembershipRepository();
    const assignRole = new AssignWorkspaceRoleUseCase(memberships);
    const useCase = new DuplicateWorkspaceUseCase(workspaces, assignRole);
    return { workspaces, memberships, useCase };
  }

  it("duplicates the workspace into a new one owned by the requester", async () => {
    const { workspaces, memberships, useCase } = setup();
    const source = Workspace.create({ name: "Source", ruleset: { a: 1 } });
    await workspaces.save(source);

    const result = await useCase.execute({
      workspaceId: source.id.toString(),
      newName: "Source copy",
      ownerId: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.id.equals(source.id)).toBe(false);
    expect(result.value.name).toBe("Source copy");
    expect(result.value.ruleset).toEqual({ a: 1 });
    const membership = await memberships.findByActor(
      result.value.id.toString(),
      "HUMAN",
      "user-1",
    );
    expect(membership?.role).toBe(WorkspaceRole.OWNER);
  });

  it("fails when the source workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      newName: "Copy",
      ownerId: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });
});
