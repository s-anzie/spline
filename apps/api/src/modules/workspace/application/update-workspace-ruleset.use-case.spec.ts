import { Workspace } from "../domain/workspace";
import { WorkspaceArchivedError } from "../domain/workspace.errors";
import { WorkspaceNotFoundError } from "./workspace-application.errors";
import { UpdateWorkspaceRulesetUseCase } from "./update-workspace-ruleset.use-case";
import { InMemoryWorkspaceRepository } from "./testing/in-memory-workspace.repository";

describe("UpdateWorkspaceRulesetUseCase", () => {
  function setup() {
    const workspaces = new InMemoryWorkspaceRepository();
    const useCase = new UpdateWorkspaceRulesetUseCase(workspaces);
    return { workspaces, useCase };
  }

  it("updates the ruleset of an existing workspace", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      ruleset: { maxConcurrentAgents: 5 },
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.ruleset).toEqual({ maxConcurrentAgents: 5 });
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ workspaceId: "unknown", ruleset: {} });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails when the workspace is archived", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    workspace.archive();
    await workspaces.save(workspace);

    const result = await useCase.execute({ workspaceId: workspace.id.toString(), ruleset: {} });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceArchivedError);
  });
});
