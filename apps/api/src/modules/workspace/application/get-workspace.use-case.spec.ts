import { Workspace } from "../domain/workspace";
import { WorkspaceNotFoundError } from "./workspace-application.errors";
import { GetWorkspaceUseCase } from "./get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "./testing/in-memory-workspace.repository";

describe("GetWorkspaceUseCase", () => {
  it("returns the workspace when it exists", async () => {
    const workspaces = new InMemoryWorkspaceRepository();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const useCase = new GetWorkspaceUseCase(workspaces);

    const result = await useCase.execute(workspace.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.name).toBe("My Project");
  });

  it("fails when the workspace does not exist", async () => {
    const workspaces = new InMemoryWorkspaceRepository();
    const useCase = new GetWorkspaceUseCase(workspaces);

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });
});
