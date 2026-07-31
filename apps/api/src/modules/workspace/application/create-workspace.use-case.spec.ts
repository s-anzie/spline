import { WorkspaceRole } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { AssignWorkspaceRoleUseCase } from "../../identity/application/assign-workspace-role.use-case";
import { InMemoryWorkspaceMembershipRepository } from "../../identity/application/testing/in-memory-workspace-membership.repository";
import { EmptyWorkspaceNameError } from "../domain/workspace.errors";
import { CreateWorkspaceUseCase } from "./create-workspace.use-case";
import { InMemoryWorkspaceRepository } from "./testing/in-memory-workspace.repository";

describe("CreateWorkspaceUseCase", () => {
  function setup() {
    const workspaces = new InMemoryWorkspaceRepository();
    const memberships = new InMemoryWorkspaceMembershipRepository();
    const assignRole = new AssignWorkspaceRoleUseCase(memberships);
    const eventPublisher = new FakeEventPublisher();
    const useCase = new CreateWorkspaceUseCase(workspaces, assignRole, eventPublisher);
    return { workspaces, memberships, eventPublisher, useCase };
  }

  it("creates the workspace and grants the creator the Owner role", async () => {
    const { workspaces, memberships, useCase } = setup();

    const result = await useCase.execute({ name: "My Project", ownerId: "user-1" });

    expect(result.isSuccess).toBe(true);
    await expect(workspaces.findById(result.value.id)).resolves.not.toBeNull();
    const membership = await memberships.findByActor(result.value.id.toString(), "HUMAN", "user-1");
    expect(membership?.role).toBe(WorkspaceRole.OWNER);
  });

  it("publishes the WorkspaceCreated domain event", async () => {
    const { eventPublisher, useCase } = setup();

    await useCase.execute({ name: "My Project", ownerId: "user-1" });

    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["workspace.created"]);
  });

  it("fails without side effects when the name is empty", async () => {
    const { workspaces, memberships, useCase } = setup();

    const result = await useCase.execute({ name: "   ", ownerId: "user-1" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyWorkspaceNameError);
    await expect(workspaces.findByIds(["anything"])).resolves.toEqual([]);
    await expect(memberships.listByWorkspace("anything")).resolves.toEqual([]);
  });
});
