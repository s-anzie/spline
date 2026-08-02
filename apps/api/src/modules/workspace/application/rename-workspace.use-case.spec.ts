import { Workspace } from "../domain/workspace";
import {
  EmptyWorkspaceNameError,
  WorkspaceArchivedError,
} from "../domain/workspace.errors";
import { WorkspaceNotFoundError } from "./workspace-application.errors";
import { RenameWorkspaceUseCase } from "./rename-workspace.use-case";
import { InMemoryWorkspaceRepository } from "./testing/in-memory-workspace.repository";

describe("RenameWorkspaceUseCase", () => {
  function setup() {
    const workspaces = new InMemoryWorkspaceRepository();
    const useCase = new RenameWorkspaceUseCase(workspaces);
    return { workspaces, useCase };
  }

  it("renames an existing workspace", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "Old" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      newName: "New",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.name).toBe("New");
  });

  it("updates the name and description together", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({
      name: "Old",
      description: "Old description",
    });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      newName: "New",
      description: "A formula: $E = mc^2$",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.name).toBe("New");
    expect(result.value.description).toBe("A formula: $E = mc^2$");
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      newName: "New",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails when the new name is empty", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "Old" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      newName: "   ",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyWorkspaceNameError);
  });

  it("fails when the workspace is archived", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "Old" });
    workspace.archive();
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      newName: "New",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceArchivedError);
  });
});
