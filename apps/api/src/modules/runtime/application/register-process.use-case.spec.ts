import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { EmptyProcessCommandError, EmptyProcessNameError } from "../domain/process.errors";
import { RegisterProcessUseCase } from "./register-process.use-case";
import { InMemoryProcessRepository } from "./testing/in-memory-process.repository";

function setup() {
  const processes = new InMemoryProcessRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const eventPublisher = new FakeEventPublisher();
  const useCase = new RegisterProcessUseCase(processes, new GetWorkspaceUseCase(workspaces), eventPublisher);
  return { processes, workspaces, eventPublisher, useCase };
}

describe("RegisterProcessUseCase", () => {
  it("registers a process in an existing workspace", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      name: "Dev server",
      command: "npm run dev",
      cwd: "apps/web",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.name).toBe("Dev server");
  });

  it("publishes ProcessRegistered", async () => {
    const { workspaces, eventPublisher, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    await useCase.execute({
      workspaceId: workspace.id.toString(),
      name: "Dev server",
      command: "npm run dev",
      cwd: "apps/web",
    });

    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["process.registered"]);
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      name: "Dev server",
      command: "npm run dev",
      cwd: "apps/web",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails with an empty name", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      name: "  ",
      command: "npm run dev",
      cwd: "apps/web",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyProcessNameError);
  });

  it("fails with an empty command", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      name: "Dev server",
      command: "  ",
      cwd: "apps/web",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyProcessCommandError);
  });
});
