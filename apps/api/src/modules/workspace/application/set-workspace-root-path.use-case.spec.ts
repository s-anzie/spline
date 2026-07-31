import { Workspace } from "../domain/workspace";
import { EmptyWorkspaceRootPathError, WorkspaceArchivedError } from "../domain/workspace.errors";
import { WorkspaceNotFoundError } from "./workspace-application.errors";
import { SetWorkspaceRootPathUseCase } from "./set-workspace-root-path.use-case";
import { InMemoryWorkspaceRepository } from "./testing/in-memory-workspace.repository";

describe("SetWorkspaceRootPathUseCase", () => {
  function setup() {
    const workspaces = new InMemoryWorkspaceRepository();
    const useCase = new SetWorkspaceRootPathUseCase(workspaces);
    return { workspaces, useCase };
  }

  it("sets the root path of an existing workspace", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      rootPath: "/home/bradley/dev-apps/spline",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.rootPath).toBe("/home/bradley/dev-apps/spline");
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ workspaceId: "unknown", rootPath: "/tmp" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails with an empty root path", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({ workspaceId: workspace.id.toString(), rootPath: "   " });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyWorkspaceRootPathError);
  });

  it("fails when the workspace is archived", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    workspace.archive();
    await workspaces.save(workspace);

    const result = await useCase.execute({ workspaceId: workspace.id.toString(), rootPath: "/tmp" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceArchivedError);
  });
});
